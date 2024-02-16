import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CsvLoaderService } from 'app/service/csv-loader.service';
import { ExcelLoaderService } from 'app/service/excel-loader.service';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class FileUploadComponent {
  @ViewChild('fileInput', {static: false}) fileInput: ElementRef<HTMLInputElement>;


  uploadedData: any;
  loading: boolean;


  @Output() onDataUploaded = new EventEmitter<any>();

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    const extension = file.name.split('.').pop();

    if (extension === 'csv') {
      this.loadCsv(file);
    } else if (extension === 'xlsx') {
      this.loadExcel(file);
    } else {
      console.error('Invalid file type');
    }
  }

  loadCsv(file: File): void {
    this.loading = true;
    const reader = new FileReader();
    reader.onload = () => {
      const csvData: string = reader.result as string;
      this.csvLoaderService.loadCsvDataFromString(csvData).subscribe(
        (data) => {
          this.loading = false;
          this.uploadedData = data;
          this.onDataUploaded.emit(this.uploadedData);
          console.log('CSV data:', this.uploadedData);
        },
        (error) => {
          this.loading = false;
          console.error('Error parsing CSV:', error);
        }
      );
    };
    reader.readAsText(file);
  }

  loadExcel(file: File): void {
    this.loading = true;
    this.excelLoaderService.loadExcelData(file).subscribe(
      (data) => {
        this.uploadedData = data;
        this.onDataUploaded.emit(this.uploadedData);
        console.log('Excel data:', this.uploadedData);
        this.loading = false;
      },
      (error) => {
        this.loading = false;
        console.error('Error parsing Excel:', error);
      }
    );
  }

  clearFileInput(): void {
    this.fileInput.nativeElement.value = '';
  }

  constructor(private csvLoaderService: CsvLoaderService, private excelLoaderService: ExcelLoaderService) {}
}
