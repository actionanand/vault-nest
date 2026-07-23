import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  VaultField,
  VaultFieldType,
  VaultItem,
  VaultItemType,
} from '../../core/models/vault.models';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { PasswordStrengthService } from '../../core/services/password-strength.service';
import { WebsiteIconService } from '../../core/services/website-icon.service';
import { VaultItemIcon } from '../../shared/components/vault-item-icon';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SelectPicker, type SelectPickerOption } from '../../shared/components/select-picker';

type FieldForm = FormGroup<{
  id: FormControl<string>;
  label: FormControl<string>;
  value: FormControl<string>;
  type: FormControl<VaultFieldType>;
  sensitive: FormControl<boolean>;
}>;

interface FieldTypeOption {
  readonly type: VaultFieldType;
  readonly label: string;
  readonly defaultName: string;
  readonly sensitive: boolean;
}

const FIELD_TYPE_ICONS: Readonly<Record<VaultFieldType, string>> = {
  TEXT: 'field_text',
  MULTILINE: 'note',
  NUMBER: 'field_number',
  USERNAME: 'identity',
  PASSWORD: 'key',
  OTP: 'key',
  EXPIRY: 'calendar',
  WEBSITE: 'globe',
  EMAIL: 'field_email',
  PHONE: 'field_phone',
  DATE: 'calendar',
  PIN: 'key',
  SECRET: 'key',
  APPLICATION: 'globe',
  BOOLEAN: 'field_toggle',
  DROPDOWN: 'chevron_down',
  HIDDEN: 'eye_off',
};

const FIELD_TYPES: readonly FieldTypeOption[] = [
  { type: 'TEXT', label: 'Text', defaultName: 'Text', sensitive: false },
  { type: 'MULTILINE', label: 'Multiline text', defaultName: 'Notes', sensitive: false },
  { type: 'NUMBER', label: 'Number', defaultName: 'Number', sensitive: false },
  { type: 'USERNAME', label: 'Username / login', defaultName: 'Username', sensitive: false },
  { type: 'PASSWORD', label: 'Password', defaultName: 'Password', sensitive: true },
  {
    type: 'OTP',
    label: 'One-time password (2FA)',
    defaultName: 'One-time password',
    sensitive: true,
  },
  { type: 'EXPIRY', label: 'Expiry', defaultName: 'Expiry', sensitive: false },
  { type: 'WEBSITE', label: 'Website', defaultName: 'Website', sensitive: false },
  { type: 'EMAIL', label: 'Email', defaultName: 'Email', sensitive: false },
  { type: 'PHONE', label: 'Phone', defaultName: 'Phone', sensitive: false },
  { type: 'DATE', label: 'Date', defaultName: 'Date', sensitive: false },
  { type: 'PIN', label: 'PIN', defaultName: 'PIN', sensitive: true },
  { type: 'SECRET', label: 'Secret', defaultName: 'Security question answer', sensitive: true },
  {
    type: 'APPLICATION',
    label: 'Application link',
    defaultName: 'Application link',
    sensitive: false,
  },
  { type: 'BOOLEAN', label: 'Yes / no', defaultName: 'Enabled', sensitive: false },
  { type: 'DROPDOWN', label: 'Dropdown value', defaultName: 'Selection', sensitive: false },
  { type: 'HIDDEN', label: 'Hidden value', defaultName: 'Hidden value', sensitive: true },
];

@Component({
  selector: 'app-item-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AppIcon,
    VaultItemIcon,
    ConfirmationDialog,
    SelectPicker,
  ],
  templateUrl: './item-editor.html',
  styleUrl: './item-editor.scss',
  host: {
    '(window:beforeunload)': 'protectBrowserUnload($event)',
  },
})
export class ItemEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vault = inject(VaultStore);
  private readonly passwordStrengthService = inject(PasswordStrengthService);
  private readonly websiteIcons = inject(WebsiteIconService);
  existing: VaultItem | null = null;
  private readonly creatingFromTemplate =
    this.route.snapshot.routeConfig?.path === 'new/template/:id';
  type = this.readType(this.route.snapshot.paramMap.get('type'));
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20_000)] }),
    backupCodes: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20_000)],
    }),
    labels: new FormControl('', { nonNullable: true }),
    favourite: new FormControl(false, { nonNullable: true }),
    expiresAt: new FormControl('', { nonNullable: true }),
    icon: new FormControl('', { nonNullable: true }),
    fields: new FormArray<FieldForm>([]),
  });
  readonly fieldTypes = FIELD_TYPES;
  readonly fieldTypePickerOptions: readonly SelectPickerOption[] = FIELD_TYPES.map((option) => ({
    value: option.type,
    label: option.label,
    detail: option.sensitive ? 'Hidden by default' : option.defaultName,
    icon: FIELD_TYPE_ICONS[option.type],
  }));
  readonly iconPresets = [
    { value: '', label: 'Automatic', icon: 'globe' },
    { value: 'preset:key', label: 'Login', icon: 'key' },
    { value: 'preset:bank', label: 'Bank', icon: 'bank' },
    { value: 'preset:card', label: 'Card', icon: 'card' },
    { value: 'preset:business', label: 'Work', icon: 'business' },
    { value: 'preset:shopping', label: 'Shopping', icon: 'shopping' },
    { value: 'preset:social', label: 'Social', icon: 'social' },
    { value: 'preset:globe', label: 'Website', icon: 'globe' },
  ] as const;
  readonly addTypeOpen = signal(false);
  readonly addDialogOpen = signal(false);
  readonly iconDialogOpen = signal(false);
  readonly deleteDialogOpen = signal(false);
  readonly deleting = signal(false);
  readonly discardDialogOpen = signal(false);
  readonly fieldMessage = signal('');
  readonly textTab = signal<'NOTES' | 'BACKUP_CODES'>('NOTES');
  readonly backupCodesVisible = signal(false);
  readonly pendingFieldType = signal<VaultFieldType>('TEXT');
  readonly customIconError = signal('');
  readonly strengthSegments = [1, 2, 3, 4] as const;
  readonly addFieldForm = new FormGroup({
    label: new FormControl('Text', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    value: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20_000)],
    }),
  });
  private deactivateResolver: ((allow: boolean) => void) | null = null;
  private deactivatePromise: Promise<boolean> | null = null;
  get fields(): FormArray<FieldForm> {
    return this.form.controls.fields;
  }
  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      if (!this.vault.items().length) await this.vault.load();
      const source = this.vault.items().find((item) => item.id === id) ?? null;
      if (this.creatingFromTemplate && source?.template) {
        this.type = source.type;
        this.patchTemplate(source);
      } else {
        this.existing = source;
        if (this.existing) this.patch(this.existing);
      }
    } else
      this.defaultFields(this.type).forEach((field) => this.fields.push(this.createField(field)));
  }
  openAddField(): void {
    this.addTypeOpen.set(true);
  }
  chooseFieldType(option: FieldTypeOption): void {
    this.pendingFieldType.set(option.type);
    this.addFieldForm.setValue({ label: option.defaultName, value: '' });
    this.addTypeOpen.set(false);
    this.addDialogOpen.set(true);
  }
  changePendingFieldType(): void {
    this.addDialogOpen.set(false);
    this.addTypeOpen.set(true);
  }
  confirmAddField(): void {
    if (this.addFieldForm.invalid) {
      this.addFieldForm.markAllAsTouched();
      return;
    }
    const option = this.fieldOption(this.pendingFieldType());
    const value = this.addFieldForm.getRawValue();
    this.fields.push(
      this.createField({
        label: value.label.trim(),
        value: value.value,
        type: option.type,
        sensitive: option.sensitive,
      }),
    );
    this.form.markAsDirty();
    this.addDialogOpen.set(false);
    this.addFieldForm.reset({ label: 'Text', value: '' });
  }
  removeField(index: number): void {
    this.fields.removeAt(index);
    this.form.markAsDirty();
  }
  duplicateField(index: number): void {
    this.fields.insert(index + 1, this.createField(this.fields.at(index).getRawValue()));
    this.form.markAsDirty();
  }
  move(index: number, offset: -1 | 1): void {
    const target = index + offset;
    if (target < 0 || target >= this.fields.length) return;
    const field = this.fields.at(index);
    this.fields.removeAt(index);
    this.fields.insert(target, field);
    this.form.markAsDirty();
  }
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const now = new Date().toISOString();
    const item: VaultItem = {
      id: this.existing?.id ?? crypto.randomUUID(),
      type: this.existing?.type ?? this.type,
      title: value.title.trim(),
      notes: value.notes,
      backupCodes: value.backupCodes || undefined,
      labels: value.labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      favourite: value.favourite,
      archived: this.existing?.archived ?? false,
      template: false,
      deletedAt: this.existing?.deletedAt,
      expiresAt: value.expiresAt || undefined,
      createdAt: this.existing?.createdAt ?? now,
      updatedAt: now,
      fields: value.fields
        .filter((field) => field.label.trim())
        .map((field): VaultField => ({
          ...field,
          id: field.id || crypto.randomUUID(),
          label: field.label.trim(),
        })),
      icon: value.icon,
    };
    await this.vault.save(item);
    const previousWebsite = this.existing ? this.websiteIcons.firstWebsite(this.existing) : null;
    const websiteChanged =
      this.existing !== null && previousWebsite !== this.websiteIcons.firstWebsite(item);
    if (!item.icon || websiteChanged) void this.websiteIcons.refreshItem(item);
    this.form.markAsPristine();
    await this.router.navigateByUrl('/vault/all');
  }
  chooseIcon(icon: string): void {
    this.form.controls.icon.setValue(icon);
    this.form.controls.icon.markAsDirty();
    this.iconDialogOpen.set(false);
  }
  iconPreview(): Pick<VaultItem, 'icon' | 'type'> {
    return { icon: this.form.controls.icon.value, type: this.type };
  }
  fieldTypeLabel(type: VaultFieldType): string {
    return this.fieldOption(type).label;
  }
  setFieldType(index: number, value: string): void {
    if (!FIELD_TYPES.some((option) => option.type === value)) return;
    const field = this.fields.at(index);
    field.controls.type.setValue(value as VaultFieldType);
    field.controls.sensitive.setValue(this.fieldOption(field.controls.type.value).sensitive);
    this.form.markAsDirty();
  }
  fieldTypeIcon(type: VaultFieldType): string {
    return FIELD_TYPE_ICONS[type];
  }
  toggleSensitive(index: number): void {
    const control = this.fields.at(index).controls.sensitive;
    control.setValue(!control.value);
    this.form.markAsDirty();
    this.showFieldMessage(
      control.value ? 'Field will be hidden by default.' : 'Field will be visible by default.',
    );
  }
  toggleFavourite(): void {
    const control = this.form.controls.favourite;
    control.setValue(!control.value);
    control.markAsDirty();
  }
  selectTextTab(tab: 'NOTES' | 'BACKUP_CODES'): void {
    this.textTab.set(tab);
  }
  toggleBackupCodesVisibility(): void {
    this.backupCodesVisible.update((visible) => !visible);
    this.showFieldMessage(
      this.backupCodesVisible() ? '2FA backup codes are visible.' : '2FA backup codes are hidden.',
    );
  }
  activeTextControl(): FormControl<string> {
    return this.textTab() === 'NOTES' ? this.form.controls.notes : this.form.controls.backupCodes;
  }
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.form.dirty) return true;
    if (this.deactivatePromise) return this.deactivatePromise;
    this.discardDialogOpen.set(true);
    this.deactivatePromise = new Promise<boolean>((resolve) => {
      this.deactivateResolver = resolve;
    });
    return this.deactivatePromise;
  }
  confirmDiscard(): void {
    this.discardDialogOpen.set(false);
    this.form.markAsPristine();
    const resolver = this.deactivateResolver;
    this.deactivateResolver = null;
    this.deactivatePromise = null;
    resolver?.(true);
  }
  cancelDiscard(): void {
    this.discardDialogOpen.set(false);
    const resolver = this.deactivateResolver;
    this.deactivateResolver = null;
    this.deactivatePromise = null;
    resolver?.(false);
  }
  protectBrowserUnload(event: BeforeUnloadEvent): void {
    if (!this.form.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }
  async deleteItem(): Promise<void> {
    if (!this.existing || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.vault.save({
        ...this.existing,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      this.deleteDialogOpen.set(false);
      this.form.markAsPristine();
      await this.router.navigateByUrl('/vault/all');
    } finally {
      this.deleting.set(false);
    }
  }
  async useCustomIcon(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.customIconError.set('');
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.customIconError.set('Choose an image up to 5 MB.');
      return;
    }
    try {
      this.form.controls.icon.setValue(await this.resizeIcon(file));
      this.form.controls.icon.markAsDirty();
      this.iconDialogOpen.set(false);
    } catch {
      this.customIconError.set('The selected image could not be read.');
    }
  }
  isHiddenType(type: VaultFieldType): boolean {
    return ['PASSWORD', 'PIN', 'SECRET', 'OTP', 'HIDDEN'].includes(type);
  }
  inputType(type: VaultFieldType, sensitive = this.fieldOption(type).sensitive): string {
    if (sensitive) return 'password';
    return (
      (
        {
          NUMBER: 'number',
          WEBSITE: 'url',
          APPLICATION: 'url',
          EMAIL: 'email',
          PHONE: 'tel',
          DATE: 'date',
          EXPIRY: 'date',
        } as Partial<Record<VaultFieldType, string>>
      )[type] ?? 'text'
    );
  }
  passwordStrength(value: string): { label: string; crackTime: string; score: number } {
    return this.passwordStrengthService.analyse(value);
  }
  private showFieldMessage(message: string): void {
    this.fieldMessage.set(message);
    setTimeout(() => {
      if (this.fieldMessage() === message) this.fieldMessage.set('');
    }, 2400);
  }
  private createField(value: {
    id?: string;
    label: string;
    value: string;
    type: VaultFieldType;
    sensitive: boolean;
  }): FieldForm {
    return new FormGroup({
      id: new FormControl(value.id ?? crypto.randomUUID(), { nonNullable: true }),
      label: new FormControl(value.label, {
        nonNullable: true,
        validators: [Validators.maxLength(100)],
      }),
      value: new FormControl(value.value, {
        nonNullable: true,
        validators: [Validators.maxLength(20_000)],
      }),
      type: new FormControl(value.type, { nonNullable: true }),
      sensitive: new FormControl(value.sensitive, { nonNullable: true }),
    });
  }
  private patch(item: VaultItem): void {
    this.form.patchValue({
      title: item.title,
      notes: item.notes,
      backupCodes: item.backupCodes ?? '',
      labels: item.labels.join(', '),
      favourite: item.favourite,
      expiresAt: item.expiresAt ?? '',
      icon: item.icon,
    });
    item.fields.forEach((field) => this.fields.push(this.createField(field)));
  }
  private patchTemplate(item: VaultItem): void {
    this.form.patchValue({
      title: '',
      notes: '',
      backupCodes: '',
      labels: item.labels.join(', '),
      favourite: false,
      expiresAt: '',
      icon: item.icon.startsWith('preset:') ? item.icon : '',
    });
    item.fields.forEach((field) =>
      this.fields.push(
        this.createField({
          ...field,
          id: crypto.randomUUID(),
          value: '',
        }),
      ),
    );
  }
  private readType(value: string | null): VaultItemType {
    return ['LOGIN', 'NOTE', 'IDENTITY', 'WIFI', 'CUSTOM'].includes(value ?? '')
      ? (value as VaultItemType)
      : 'LOGIN';
  }
  private fieldOption(type: VaultFieldType): FieldTypeOption {
    return FIELD_TYPES.find((option) => option.type === type) ?? FIELD_TYPES[0];
  }
  private resizeIcon(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Image decode failed'));
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 192;
          canvas.height = 192;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Canvas is unavailable'));
            return;
          }
          const scale = Math.max(192 / image.naturalWidth, 192 / image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          context.drawImage(image, (192 - width) / 2, (192 - height) / 2, width, height);
          resolve(canvas.toDataURL('image/webp', 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
  private defaultFields(type: VaultItemType): readonly Omit<VaultField, 'id'>[] {
    const field = (label: string, fieldType: VaultFieldType, sensitive = false) => ({
      label,
      value: '',
      type: fieldType,
      sensitive,
    });
    if (type === 'LOGIN')
      return [
        field('Username', 'USERNAME'),
        field('Password', 'PASSWORD', true),
        field('Website', 'WEBSITE'),
        field('Email', 'EMAIL'),
      ];
    if (type === 'NOTE') return [];
    if (type === 'IDENTITY')
      return [
        field('Full name', 'TEXT'),
        field('Email', 'EMAIL'),
        field('Phone', 'PHONE'),
        field('Address', 'MULTILINE'),
      ];
    if (type === 'WIFI')
      return [
        field('Network name', 'TEXT'),
        field('Password', 'PASSWORD', true),
        field('Security type', 'DROPDOWN'),
        field('Router address', 'WEBSITE'),
      ];
    return [];
  }
}
