import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
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

  @Input() type: 'rawCounts' | 'results';


  uploadedData: any;
  loading: boolean;


  @Output() onDataUploaded = new EventEmitter<{filename: string, data: any, sids?: any}>();

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    const extension = file.name.split('.').pop();

    switch (this.type) {
      case 'rawCounts':
        if (extension === 'csv') {
          this.loadRawCountsCSV(file);
        } else if (extension === 'xlsx') {
          alert('Excel not supported for raw counts yet')
        } else {
          console.error('Invalid file type');
        }
        break;
      case 'results':
        if (extension === 'csv') {
          this.loadResultsCSV(file);
        } else if (extension === 'xlsx') {
          this.loadResultsExcel(file);
        } else {
          console.error('Invalid file type');
        }
        break;
      default:
        console.error('Invalid file type');
        break;
    }


  }

  loadRawCountsCSV(file: File): void {
    this.loading = true;
    const reader = new FileReader();
    reader.onload = () => {
      const csvData: string = reader.result as string;
      this.csvLoaderService.loadRawCountsCSVFromString(csvData).subscribe(
        (res) => {
          this.loading = false;
          this.uploadedData = res.data;
          this.onDataUploaded.emit({
            filename: file.name,
            data: this.uploadedData,
            sids: res.headers
          });
          console.log('CSV data:', this.uploadedData);
          console.log('CSV headers:', res.headers)
        },
        (error) => {
          this.loading = false;
          console.error('Error parsing CSV:', error);
        }
      );
    };
    reader.readAsText(file);
  }

  loadResultsCSV(file: File): void {
    this.loading = true;
    const reader = new FileReader();
    reader.onload = () => {
      const csvData: string = reader.result as string;
      this.csvLoaderService.loadResultsCSVFromString(csvData).subscribe(
        (data) => {
          this.loading = false;
          this.uploadedData = data;
          this.onDataUploaded.emit({
            filename: file.name,
            data: this.uploadedData,
          });
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

  loadResultsExcel(file: File): void {
    this.loading = true;
    this.excelLoaderService.loadResultsExcel(file).subscribe(
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
