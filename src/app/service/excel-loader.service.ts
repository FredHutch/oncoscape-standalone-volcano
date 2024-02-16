import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import * as XLSX from 'xlsx';

@Injectable({
  providedIn: 'root',
})
export class ExcelLoaderService {
  constructor() {}

  loadExcelData(file: File): Observable<any> {
    return new Observable((observer) => {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const result: any = {};
        const headers: any[] = jsonData[0];

        for (let i = 1; i < jsonData.length; i++) {
          const currentRow = jsonData[i];
          for (let j = 0; j < headers.length; j++) {
            const header = headers[j] === undefined ? undefined : headers[j].toString().trim();
            const value =  currentRow[j] === undefined ? undefined : currentRow[j].toString().trim();
            if (!result[header]) {
              result[header] = {};
            }

            // try to convert value: string to number
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              result[header][currentRow[0].trim()] = numValue;
            } else {
              result[header][currentRow[0].trim()] = value;
            }
          }
        }

        observer.next(result);
        observer.complete();
      };

      reader.readAsBinaryString(file);
    });
  }

}
