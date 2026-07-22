import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  imports: [NgOptimizedImage],
  template: `<span class="mark"
      ><img ngSrc="vault-nest.png" width="96" height="96" priority alt=""
    /></span>
    @if (showName()) {
      <span class="name">Vault Nest</span>
    }`,
  styles: `
    .mark {
      display: grid;
      width: 3rem;
      height: 3rem;
      overflow: hidden;
      place-items: center;
      border-radius: 1rem;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .name {
      font-size: 1.05rem;
      font-weight: 750;
      letter-spacing: -0.02em;
    }
  `,
})
export class BrandMark {
  readonly showName = input(true);
}
