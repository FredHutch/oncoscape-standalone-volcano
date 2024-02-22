import { Component, Input } from '@angular/core';
import {Status} from 'app/service/worker/worker.service.types';

@Component({
  selector: 'app-status-icon',
  templateUrl: './status-icon.component.html',
})
export class StatusIconComponent {
  @Input() status: Status;

  /**
   * Size of the icon in pixels.
   */
  @Input() size: number = 30;
}
