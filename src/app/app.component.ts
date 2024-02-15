import { Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CsvLoaderService } from './service/csv-loader.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  public volcanoData: any;

  ngOnInit() {
    this.csv.loadCsvData('assets/data/python_results_from_oncoscape_data.csv').subscribe((data) => {
      this.volcanoData = data;
    });
  }

  constructor(private csv: CsvLoaderService) {
  }
}
