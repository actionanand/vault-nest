import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/services/auth.store';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly theme = inject(ThemeService);
  async ngOnInit(): Promise<void> {
    await this.auth.initialise();
    if (this.auth.status() !== 'ERROR') await this.theme.initialise();
  }
}
