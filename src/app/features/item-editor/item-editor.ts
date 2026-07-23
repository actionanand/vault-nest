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
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { WebsiteIconService } from '../../core/services/website-icon.service';
import { VaultItemIcon } from '../../shared/components/vault-item-icon';

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
  imports: [ReactiveFormsModule, RouterLink, AppIcon, VaultItemIcon],
  templateUrl: './item-editor.html',
  styleUrl: './item-editor.scss',
})
export class ItemEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vault = inject(VaultStore);
  private readonly passwordGenerator = inject(PasswordGeneratorService);
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
    labels: new FormControl('', { nonNullable: true }),
    favourite: new FormControl(false, { nonNullable: true }),
    expiresAt: new FormControl('', { nonNullable: true }),
    icon: new FormControl('', { nonNullable: true }),
    fields: new FormArray<FieldForm>([]),
  });
  readonly fieldTypes = FIELD_TYPES;
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
    this.addDialogOpen.set(false);
    this.addFieldForm.reset({ label: 'Text', value: '' });
  }
  removeField(index: number): void {
    this.fields.removeAt(index);
  }
  duplicateField(index: number): void {
    this.fields.insert(index + 1, this.createField(this.fields.at(index).getRawValue()));
  }
  move(index: number, offset: -1 | 1): void {
    const target = index + offset;
    if (target < 0 || target >= this.fields.length) return;
    const field = this.fields.at(index);
    this.fields.removeAt(index);
    this.fields.insert(target, field);
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
  }
  iconPreview(): Pick<VaultItem, 'icon' | 'type'> {
    return { icon: this.form.controls.icon.value, type: this.type };
  }
  fieldTypeLabel(type: VaultFieldType): string {
    return this.fieldOption(type).label;
  }
  fieldTypeChanged(index: number): void {
    const field = this.fields.at(index);
    field.controls.sensitive.setValue(this.fieldOption(field.controls.type.value).sensitive);
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
    } catch {
      this.customIconError.set('The selected image could not be read.');
    }
  }
  isHiddenType(type: VaultFieldType): boolean {
    return ['PASSWORD', 'PIN', 'SECRET', 'OTP', 'HIDDEN'].includes(type);
  }
  inputType(type: VaultFieldType): string {
    if (this.isHiddenType(type)) return 'password';
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
    if (!value) return { label: 'Enter a password', crackTime: 'Not estimated', score: 0 };
    const entropy = this.passwordGenerator.entropy(value);
    const score = Math.min(4, Math.max(1, Math.ceil(entropy / 25)));
    const label =
      entropy >= 100
        ? 'Very strong'
        : entropy >= 75
          ? 'Strong'
          : entropy >= 50
            ? 'Fair'
            : entropy >= 30
              ? 'Weak'
              : 'Very weak';
    const seconds = 2 ** Math.min(entropy, 1024) / 10_000_000_000;
    return { label, crackTime: this.formatDuration(seconds), score };
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
  private formatDuration(seconds: number): string {
    if (seconds < 1) return 'Instantly crackable';
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)} hours`;
    if (seconds < 31_536_000) return `${Math.round(seconds / 86_400)} days`;
    const years = seconds / 31_536_000;
    if (years < 100) return `${Math.round(years)} years`;
    if (years < 1_000) return 'Centuries';
    if (years < 1_000_000) return 'Thousands of years';
    return 'Millions of years';
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
