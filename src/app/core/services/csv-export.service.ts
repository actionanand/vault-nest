import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import type { VaultField, VaultFieldType, VaultItem } from '../models/vault.models';
import { VaultStore } from './vault.store';

interface NativeCsvBridge {
  saveCsv(fileName: string, base64Data: string): void;
}

interface NativeCsvWindow extends Window {
  VaultNestNative?: NativeCsvBridge;
}

interface CsvRow {
  readonly title: string;
  readonly category: string;
  readonly username: string;
  readonly password: string;
  readonly website: string;
  readonly email: string;
  readonly phone: string;
  readonly oneTimePassword: string;
  readonly notes: string;
  readonly backupCodes: string;
  readonly labels: string;
  readonly favourite: string;
  readonly archived: string;
  readonly allFieldsJson: string;
}

const HEADERS: readonly (keyof CsvRow)[] = [
  'title',
  'category',
  'username',
  'password',
  'website',
  'email',
  'phone',
  'oneTimePassword',
  'notes',
  'backupCodes',
  'labels',
  'favourite',
  'archived',
  'allFieldsJson',
];

const HEADER_LABELS: Readonly<Record<keyof CsvRow, string>> = {
  title: 'title',
  category: 'category',
  username: 'username',
  password: 'password',
  website: 'website',
  email: 'email',
  phone: 'phone',
  oneTimePassword: 'one_time_password',
  notes: 'notes',
  backupCodes: 'backup_codes',
  labels: 'labels',
  favourite: 'favourite',
  archived: 'archived',
  allFieldsJson: 'all_fields_json',
};

@Service()
export class CsvExportService {
  private readonly document = inject(DOCUMENT);
  private readonly vault = inject(VaultStore);

  async export(): Promise<{ readonly count: number; readonly fileName: string }> {
    const items = this.vault
      .items()
      .filter((item) => !item.deletedAt && !item.template)
      .sort((left, right) => left.title.localeCompare(right.title));
    if (items.length === 0) {
      throw new Error('There are no active or archived credentials to export.');
    }

    const csv = this.createCsv(items);
    const fileName = `vault-nest-export-${new Date().toISOString().slice(0, 10)}.csv`;
    await this.save(fileName, csv);
    return { count: items.length, fileName };
  }

  private createCsv(items: readonly VaultItem[]): string {
    const header = HEADERS.map((key) => this.escape(HEADER_LABELS[key])).join(',');
    const rows = items.map((item) => {
      const row = this.toRow(item);
      return HEADERS.map((key) => this.escape(row[key])).join(',');
    });
    return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
  }

  private toRow(item: VaultItem): CsvRow {
    return {
      title: item.title,
      category: item.type,
      username: this.firstField(item, ['USERNAME']),
      password: this.firstField(item, ['PASSWORD']),
      website: this.firstField(item, ['WEBSITE', 'APPLICATION']),
      email: this.firstField(item, ['EMAIL']),
      phone: this.firstField(item, ['PHONE']),
      oneTimePassword: this.firstField(item, ['OTP']),
      notes: item.notes,
      backupCodes: item.backupCodes ?? '',
      labels: item.labels.join(', '),
      favourite: item.favourite ? 'true' : 'false',
      archived: item.archived ? 'true' : 'false',
      allFieldsJson: JSON.stringify(item.fields.map((field) => this.portableField(field))),
    };
  }

  private firstField(item: VaultItem, types: readonly VaultFieldType[]): string {
    return item.fields.find((field) => types.includes(field.type))?.value ?? '';
  }

  private portableField(field: VaultField): {
    readonly label: string;
    readonly type: VaultFieldType;
    readonly value: string;
    readonly sensitive: boolean;
  } {
    return {
      label: field.label,
      type: field.type,
      value: field.value,
      sensitive: field.sensitive,
    };
  }

  private escape(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  private async save(fileName: string, contents: string): Promise<void> {
    const nativeBridge = (this.document.defaultView as NativeCsvWindow | null)?.VaultNestNative;
    if (nativeBridge?.saveCsv) {
      await this.waitForNativeResult('csv-saved', () =>
        nativeBridge.saveCsv(fileName, this.toBase64(new TextEncoder().encode(contents))),
      );
      return;
    }

    const file = new File([contents], fileName, { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  private waitForNativeResult(action: string, start: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const handleResult = (event: Event) => {
        const detail = (
          event as CustomEvent<{
            action: string;
            success: boolean;
            message?: string;
          }>
        ).detail;
        if (detail.action !== action) return;
        this.document.defaultView?.removeEventListener('vault-nest-native-result', handleResult);
        if (detail.success) resolve();
        else reject(new Error(detail.message ?? 'The CSV save was cancelled.'));
      };
      this.document.defaultView?.addEventListener('vault-nest-native-result', handleResult);
      start();
    });
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < value.length; offset += 0x8000) {
      binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }
}
