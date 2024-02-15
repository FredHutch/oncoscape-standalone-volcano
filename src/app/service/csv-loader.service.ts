import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class CsvLoaderService {
  constructor(private http: HttpClient) {}

  loadCsvData(filePath: string): Observable<any> {
    return this.http.get(filePath, { responseType: 'text' }).pipe(
      map((csvData: string) => {
        const result: any = {};
        const lines = csvData.split('\n');
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
          const currentLine = lines[i].split(',');
          if (currentLine.length === headers.length) {
            for (let j = 0; j < headers.length; j++) {
              const header = headers[j].trim();
              const value = currentLine[j].trim();
              if (!result[header]) {
                result[header] = {};
              }

              // try to convert value: string to number
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                result[header][currentLine[0].trim()] = numValue;
              } else {
                result[header][currentLine[0].trim()] = value;
              }
            }
          }
        }
        return result;
      })
    );
  }

  // Add this method to the CsvLoaderService
loadCsvDataFromString(csvData: string): Observable<any> {
  return of(csvData).pipe(
    map((csvDataString) => {
      const result: any = {};
      const lines = csvDataString.split('\n');
      const headers = lines[0].split(',');

      for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i].split(',');
        if (currentLine.length === headers.length) {
          for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = currentLine[j].trim();
            if (!result[header]) {
              result[header] = {};
            }

            // try to convert value: string to number
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              result[header][currentLine[0].trim()] = numValue;
            } else {
              result[header][currentLine[0].trim()] = value;
            }
          }
        }
      }
      return result;
    })
  );
}
}
