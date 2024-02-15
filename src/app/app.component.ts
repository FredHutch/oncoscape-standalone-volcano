import { Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CsvLoaderService } from './service/csv-loader.service';

@Pipe({
  name: 'scientific',
})
export class ScientificPipe implements PipeTransform {
  transform(value: number, args?: Array<string>): string {

    const precision = args && args.length > 0 ? parseInt(args[0]) : 3;
    const forceExponential = args && args.length > 1 ? args[1] === 'true' : false;

    if (!forceExponential && value > 1e-3 && value < 1e3) {
      return value.toFixed(precision);
    }

    return value.toExponential(precision);
  }
}

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
