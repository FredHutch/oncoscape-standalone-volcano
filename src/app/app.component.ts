import { AfterViewInit, Component, OnInit, ViewChild, Pipe, PipeTransform } from '@angular/core';
import { PythonService } from './python.service';
import { MatSnackBar, MatSort, MatTableDataSource, Sort, SortDirection } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import {FormControl, FormGroup, Validators} from '@angular/forms';

type Point = {
  x: number;
  y: number;
  gene: string;
}


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
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit, OnInit {
  title = 'pydeseq2-custom-worker';
  public selectedPoints: Point[] = Array(500).fill(0).map((_, i) => ({
    x: Math.random() * 100 - 50,
    y: Math.random() * 0.001,
    gene: `gene-${i}`
  })).sort((a, b) => a.y - b.y);

  public filterForm: FormGroup;
  public geneName: string = '';
  public regulation: string = 'all';

  // MatTable data source
  dataSource: MatTableDataSource<{ x: number; y: number; gene: string }>;

  // Displayed columns in the MatTable
  displayedColumns: string[] = ['select', 'rank', 'gene', 'y', 'x' ];

  selection: SelectionModel<Point>;

  formatNumber(num: number): string {
    // scientific notation, with 3 decimal places
    return num.toExponential(3);
  }

  // Reference to MatSort for sorting
  @ViewChild(MatSort, {static: true}) sort: MatSort;

  ngOnInit(): void {
    this.filterFormInit();
    const initialSelection = [];
    const allowMultiSelect = true;
    this.selection = new SelectionModel<Point>(allowMultiSelect, initialSelection);
  }

  ngAfterViewInit(): void {

    // Initialize MatTableDataSource with selectedPoints data
    this.dataSource = new MatTableDataSource(this.selectedPoints);

    // Connect the MatTableDataSource to the MatSort
    this.dataSource.sort = this.sort;
    this.dataSource.filterPredicate = this.getFilterPredicate();
  }

  filterFormInit() {
    this.filterForm = new FormGroup({
      geneName: new FormControl(''),
      regulation: new FormControl('all')
    });
  }

  getFilterPredicate() {
    return (row: Point, filters: string) => {
      // split string per '$' to array
      const filterArray = filters.split('$');
      const geneName = filterArray[0];
      const regulation = filterArray[1];

      const matchFilter = [];

      // Fetch data from row
      const columnGene = row.gene;
      const columnRegulation = row.x > 0 ? 'upregulated' : 'downregulated';

      // verify fetching data by our searching values
      const customFilterGeneName = columnGene.toLowerCase().includes(geneName);
      const customFilterRegulation = columnRegulation === regulation || regulation === 'all';

      // push boolean values into array
      matchFilter.push(customFilterGeneName);
      matchFilter.push(customFilterRegulation);

      // return true if all values in array are true
      // else return false
      return matchFilter.every(Boolean);
    };
  }

  getDataSortedBy(column: string, direction: SortDirection): Point[] {
    return [...this.selectedPoints].sort((a, b) => {
      if (direction === 'asc') {
        return a[column] - b[column];
      } else {
        return b[column] - a[column];
      }
    });
  }


  applyFilter() {
    const geneName = this.filterForm.get('geneName').value;
    const regulation = this.filterForm.get("regulation").value;

    this.geneName = geneName === null ? '' : geneName;
    this.regulation = regulation === null ? 'all' : regulation;

    // create string of our searching values and split if by '$'
    const filterValue = geneName + '$' + regulation;
    this.dataSource.filter = filterValue.trim();
  }

  onRowToggle(row: Point, index: number) {
  }

  handleSortChange(sortState: Sort) {
    console.log(sortState);
    const sortedData = this.getDataSortedBy(sortState.active, sortState.direction);
    console.log(sortedData);
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected == numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    this.isAllSelected() ?
        this.selection.clear() :
        this.dataSource.data.forEach(row => this.selection.select(row));
  }

  constructor() {}
}
