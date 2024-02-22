import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';

export interface DialogData {
  jobName: string;
  jobId: number;
}

@Component({
  selector: 'app-delete-job-dialog',
  templateUrl: './delete-job-dialog.component.html',
  styleUrls: ['./delete-job-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteJobDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<DeleteJobDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {}

  onNoClick(): void {
    this.dialogRef.close(false);
  }

  onYesClick(): void {
    this.dialogRef.close(true);
  }
}
