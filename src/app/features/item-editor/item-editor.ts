import { Component, inject, OnInit } from '@angular/core';
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

type FieldForm = FormGroup<{
  id: FormControl<string>;
  label: FormControl<string>;
  value: FormControl<string>;
  type: FormControl<VaultFieldType>;
  sensitive: FormControl<boolean>;
}>;

@Component({
  selector: 'app-item-editor',
  imports: [ReactiveFormsModule, RouterLink, AppIcon],
  templateUrl: './item-editor.html',
  styleUrl: './item-editor.scss',
})
export class ItemEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vault = inject(VaultStore);
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
    fields: new FormArray<FieldForm>([]),
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
  addField(): void {
    this.fields.push(this.createField({ label: '', value: '', type: 'TEXT', sensitive: false }));
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
      icon: this.existing?.icon ?? '',
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
    };
    await this.vault.save(item);
    this.form.markAsPristine();
    await this.router.navigateByUrl('/vault/all');
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
