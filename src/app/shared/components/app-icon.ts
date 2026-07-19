import { Component, computed, input } from '@angular/core';
import {
  LucideArchive,
  LucideArrowLeft,
  LucideChevronDown,
  LucideClipboard,
  LucideCopy,
  LucideDice5,
  LucideDynamicIcon,
  LucideEllipsisVertical,
  LucideEye,
  LucideEyeOff,
  LucideFileKey,
  LucideFileText,
  LucideFingerprint,
  LucideHeart,
  LucideHouse,
  LucideKeyRound,
  LucideLockKeyhole,
  LucideMenu,
  LucideMoon,
  LucidePanelLeft,
  LucidePlus,
  LucideSearch,
  LucideSettings,
  LucideShieldCheck,
  LucideSlidersHorizontal,
  LucideSparkles,
  LucideStar,
  LucideSun,
  LucideTag,
  LucideTrash2,
  LucideUserRound,
  LucideWifi,
  LucideX,
  type LucideIconInput,
} from '@lucide/angular';

const ICONS: Readonly<Record<string, LucideIconInput>> = {
  archive: LucideArchive,
  back: LucideArrowLeft,
  chevron_down: LucideChevronDown,
  clipboard: LucideClipboard,
  copy: LucideCopy,
  generator: LucideDice5,
  more: LucideEllipsisVertical,
  eye: LucideEye,
  eye_off: LucideEyeOff,
  custom: LucideFileKey,
  note: LucideFileText,
  biometric: LucideFingerprint,
  favourite: LucideHeart,
  home: LucideHouse,
  key: LucideKeyRound,
  lock: LucideLockKeyhole,
  menu: LucideMenu,
  moon: LucideMoon,
  panel: LucidePanelLeft,
  plus: LucidePlus,
  search: LucideSearch,
  settings: LucideSettings,
  shield: LucideShieldCheck,
  filter: LucideSlidersHorizontal,
  sparkle: LucideSparkles,
  star: LucideStar,
  sun: LucideSun,
  label: LucideTag,
  trash: LucideTrash2,
  identity: LucideUserRound,
  wifi: LucideWifi,
  close: LucideX,
};

@Component({
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  template: `<svg [lucideIcon]="icon()" aria-hidden="true" focusable="false"></svg>`,
  styles: `
    :host {
      display: inline-grid;
      width: 1.25rem;
      height: 1.25rem;
      place-items: center;
      flex: 0 0 auto;
    }
    svg {
      width: 100%;
      height: 100%;
      stroke-width: 1.8;
    }
  `,
})
export class AppIcon {
  readonly name = input('shield');
  readonly icon = computed(() => ICONS[this.name()] ?? LucideShieldCheck);
}
