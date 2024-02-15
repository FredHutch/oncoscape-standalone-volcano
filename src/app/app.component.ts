import { ChangeDetectorRef, Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CsvLoaderService } from './service/csv-loader.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  public volcanoData: any;
  public showVolcano = false;

  private replaceKeys(data: any, toReplace: string[], replaceWith: string): any {
    toReplace.forEach((key) => {
      if (data[key]) {
        data[replaceWith] = data[key];
        delete data[key];
      }
    });
  }

  onDataUploaded(data: any) {

    // if there is a key "genes" or lowercase "geneid" or "gene_id" or "gene", replace them with "geneID"
    this.replaceKeys(data, ['genes', 'geneid', 'gene_id', 'gene'], 'geneID');

    // if the geneID column still doesn't exist, use the first column as geneID
    if (!data.geneID) {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        data['geneID'] = data[keys[0]];
        delete data[keys[0]];
      }
    }

    // same for logFC to log2FoldChange
    this.replaceKeys(data, ['logFC'], 'log2FoldChange');

    // same for FDR to padj
    this.replaceKeys(data, ['FDR'], 'padj');

    // if the 3 columns needs are still not there, return early and alert the user
    if (!data.geneID || !data.log2FoldChange || !data.padj) {
      alert('Invalid CSV file. Please make sure the file contains geneID, log2FoldChange, and padj columns with column headers');
      return;
    }

    this.volcanoData = data;
    this.showVolcano = false;
    this.cd.detectChanges();
    this.showVolcano = true;
    this.cd.detectChanges();
  }

  ngOnInit() {
    this.csv.loadCsvData('assets/data/python_results_from_oncoscape_data.csv').subscribe((data) => {


      this.volcanoData = data;
      this.showVolcano = true;
    });
  }

  constructor(private csv: CsvLoaderService, private cd: ChangeDetectorRef) {
  }
}
