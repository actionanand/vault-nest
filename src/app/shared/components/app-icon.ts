import { Component, computed, input } from '@angular/core';
import {
  LucideArchive,
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowUp,
  LucideArrowUpToLine,
  LucideChevronDown,
  LucideClipboard,
  LucideCamera,
  LucideBriefcaseBusiness,
  LucideCopy,
  LucideCreditCard,
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
  LucideGlobe,
  LucideKeyRound,
  LucideLockKeyhole,
  LucideMenu,
  LucideMessageCircle,
  LucideMoon,
  LucidePanelLeft,
  LucidePencil,
  LucidePlus,
  LucideSearch,
  LucideShoppingBag,
  LucideRotateCcw,
  LucideShare2,
  LucideSettings,
  LucideShieldCheck,
  LucideSlidersHorizontal,
  LucideSparkles,
  LucideStar,
  LucideSun,
  LucideTag,
  LucideTags,
  LucideTrash2,
  LucideUserRound,
  LucideLandmark,
  LucideWifi,
  LucideX,
  type LucideIconInput,
} from '@lucide/angular';

const ICONS: Readonly<Record<string, LucideIconInput>> = {
  archive: LucideArchive,
  arrow_down: LucideArrowDown,
  arrow_up: LucideArrowUp,
  notify_copy: LucideArrowUpToLine,
  back: LucideArrowLeft,
  chevron_down: LucideChevronDown,
  clipboard: LucideClipboard,
  camera: LucideCamera,
  business: LucideBriefcaseBusiness,
  copy: LucideCopy,
  card: LucideCreditCard,
  generator: LucideDice5,
  more: LucideEllipsisVertical,
  eye: LucideEye,
  eye_off: LucideEyeOff,
  custom: LucideFileKey,
  note: LucideFileText,
  biometric: LucideFingerprint,
  favourite: LucideHeart,
  home: LucideHouse,
  globe: LucideGlobe,
  key: LucideKeyRound,
  lock: LucideLockKeyhole,
  menu: LucideMenu,
  social: LucideMessageCircle,
  moon: LucideMoon,
  panel: LucidePanelLeft,
  edit: LucidePencil,
  plus: LucidePlus,
  search: LucideSearch,
  shopping: LucideShoppingBag,
  restore: LucideRotateCcw,
  share: LucideShare2,
  settings: LucideSettings,
  shield: LucideShieldCheck,
  filter: LucideSlidersHorizontal,
  sparkle: LucideSparkles,
  star: LucideStar,
  sun: LucideSun,
  label: LucideTag,
  labels: LucideTags,
  trash: LucideTrash2,
  bank: LucideLandmark,
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
    :host(.filled) svg {
      fill: currentColor;
    }
  `,
})
export class AppIcon {
  readonly name = input('shield');
  readonly icon = computed(() => ICONS[this.name()] ?? LucideShieldCheck);
}
