import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CsvLoaderService } from 'app/service/csv-loader.service';

@Component({
  selector: 'app-csv-upload',
  templateUrl: './csv-upload.component.html',
  styleUrls: ['./csv-upload.component.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class CsvUploadComponent {
  @ViewChild('fileInput', {static: false}) fileInput: ElementRef<HTMLInputElement>;
  uploadedCsvData: any;

  @Output() onDataUploaded = new EventEmitter<any>();

  constructor(private csvLoaderService: CsvLoaderService) {}

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.loadCsv(file);
    }
  }

  loadCsv(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const csvData: string = reader.result as string;
      this.csvLoaderService.loadCsvDataFromString(csvData).subscribe(
        (data) => {
          this.uploadedCsvData = data;
          this.onDataUploaded.emit(this.uploadedCsvData);
          console.log('CSV data:', this.uploadedCsvData);
        },
        (error) => {
          console.error('Error parsing CSV:', error);
        }
      );
    };
    reader.readAsText(file);
  }

  clearFileInput(): void {
    this.fileInput.nativeElement.value = '';
  }
}
