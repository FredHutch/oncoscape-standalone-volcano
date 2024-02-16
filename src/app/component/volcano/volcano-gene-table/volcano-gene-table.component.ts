import { AfterViewInit, Component, OnInit, ViewChild, Pipe, PipeTransform, Input, Output, ChangeDetectorRef } from '@angular/core';
import { MatCheckbox, MatSnackBar, MatSort, MatTable, MatTableDataSource } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import { EventEmitter } from '@angular/core';
import { Point } from "../volcano.component"

@Component({
  selector: 'app-volcano-gene-table',
  templateUrl: 'volcano-gene-table.component.html',
  styleUrls: ['volcano-gene-table.component.scss']
})
export class VolcanoGeneTableComponent implements AfterViewInit, OnInit {

  private _selectedPoints: Point[] = [];
  @Input() set selectedPoints(points: Point[]) {
    this._selectedPoints = points;

    // detect changes so the sort ViewChild is available
    this.cd.detectChanges();
    this.initDataSource();

    // detect changes so the table ViewChild is available and the data updates
    this.cd.detectChanges();
    if (this.table) {
      this.table.renderRows();
    }
  }
  get selectedPoints(): Point[] {
    return this._selectedPoints;
  }
  @Output() selectionChanged: EventEmitter<Point[]> = new EventEmitter();

  public filterForm: FormGroup;
  public geneName: string = '';
  public regulation: string = 'all';

  // MatTable data source
  dataSource: MatTableDataSource<Point>;

  // Displayed columns in the MatTable
  displayedColumns: string[] = ['select', 'gene', 'y', 'x' ];

  selection: SelectionModel<Point>;


  formatNumber(num: number): string {
    // scientific notation, with 3 decimal places
    return num.toExponential(3);
  }

  // Reference to MatSort for sorting
  @ViewChild(MatSort, {static: false}) sort: MatSort;
  @ViewChild(MatTable, {static: false}) table: MatTable<Point>;

  ngOnInit(): void {
    this.filterFormInit();
    const initialSelection = [];
    const allowMultiSelect = true;
    this.selection = new SelectionModel<Point>(allowMultiSelect, initialSelection);
    this.selection.changed.subscribe((selection) => {
      this.selectionChanged.emit(selection.source.selected);
    });
  }

  ngAfterViewInit(): void {
    this.initDataSource();
  }

  private sortingDataAccessor = (data: Point, sortHeaderId: string): string | number => {
    switch (sortHeaderId) {
      case 'rank': return data.y;
      case 'gene': return data.gene;
      case 'y': return data.y;
      // sort by absolute value of x (logFC)
      case 'x': return Math.abs(data.x);
      default: return '';
    }
  }

  private initDataSource() {
    this.dataSource = new MatTableDataSource(this._selectedPoints);
    this.dataSource.sort = this.sort;
    this.dataSource.filterPredicate = this.getFilterPredicate();
    this.dataSource.sortingDataAccessor = this.sortingDataAccessor;
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
      const customFilterGeneName = columnGene.toLowerCase().includes(geneName.toLowerCase());
      const customFilterRegulation = columnRegulation === regulation || regulation === 'all';

      // push boolean values into array
      matchFilter.push(customFilterGeneName);
      matchFilter.push(customFilterRegulation);

      // return true if all values in array are true
      // else return false
      return matchFilter.every(Boolean);
    };
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

  copyToClipboard() {
    const clipboardText = this._selectedPoints.map(p => p.gene).join('\n');
    navigator.clipboard.writeText(clipboardText).then(() => {
      this._snackbar.open('Copied selected genes to clipboard', '', {
        duration: 2000,
        horizontalPosition: "right",
        verticalPosition: "top"
      });
    }).catch((err) => {
      console.error('Failed to copy to clipboard', err);
      this._snackbar.open('Failed to copy to clipboard', '', {
        duration: 2000,
        horizontalPosition: "right",
        verticalPosition: "top"
    });
    });
  }


  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected == numRows;
  }

  private masterToggleState: {checked: boolean, indeterminate: boolean} = {checked: false, indeterminate: false};

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {

    if (!this.isAllSelected() && this.dataSource.data.length > 250) {
      alert('When toggling all labels, please select less than 250 genes to avoid performance issues');
      return;
    }

    this.isAllSelected() ?
        this.selection.clear() :
        this.dataSource.data.forEach(row => this.selection.select(row));
  }

  constructor(public cd: ChangeDetectorRef, private _snackbar: MatSnackBar) {}
}
