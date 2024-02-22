import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';

export interface DialogData {
  jobName: string;
  jobId: number;
}

@Component({
  selector: 'app-cancel-job-dialog',
  templateUrl: './cancel-job-dialog.component.html',
  styleUrls: ['./cancel-job-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelJobDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<CancelJobDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {}

  onNoClick(): void {
    this.dialogRef.close(false);
  }

  onYesClick(): void {
    this.dialogRef.close(true);
  }
}
