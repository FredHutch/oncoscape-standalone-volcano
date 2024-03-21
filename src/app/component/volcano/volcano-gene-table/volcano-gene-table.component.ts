import { AfterViewInit, Component, OnInit, ViewChild, Pipe, PipeTransform, Input, Output, ChangeDetectorRef, Host } from '@angular/core';
import { MatCheckbox, MatCheckboxChange, MatPaginator, MatSnackBar, MatSort, MatTable, MatTableDataSource } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import { EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { VolcanoSelection } from '../volcano.component.types';

type Point = { x: number; y: number; gene: string }

let sortBy = (keys, data) => {
  return data.sort((i, j) => {
      for (let keyObj of keys) {
          const { key, asc, func } = keyObj;
          const order = asc ? 1 : -1;

          if (func) {
              const result = func(i[key], j[key]);
              if (result !== 0) {
                  return result * order;
              }
          } else {
              const diff = i[key] - j[key];
              if (diff !== 0) {
                  return diff * order;
              }
          }
      }

      return 0;
  });
};

@Component({
  selector: 'app-volcano-gene-table',
  templateUrl: 'volcano-gene-table.component.html',
  styleUrls: ['volcano-gene-table.component.scss']
})
export class VolcanoGeneTableComponent implements AfterViewInit, OnInit {

  controlsOpen: boolean = true;

  @Input() getGeneRegulation: (point: Point) => 'up' | 'down' | 'none';
  @Input() upregulatedColor: string = 'green';
  @Input() downregulatedColor: string = 'red';
  @Input() selectByStatsFormCollapsed: boolean = false;
  private _selectedPoints: Point[] = [];
  @Input() selectionObservable: Observable<VolcanoSelection>;

  private _points: Point[] = [];
  @Input() set points(points: Point[]) {

    // sort incoming points by descending abs(logFC)
    this._points = sortBy([{
      key: 'x',
      asc: false,
      func: (a: number, b: number) => {
        return Math.abs(a) - Math.abs(b)
      }
    }
  ], points)

    // detect changes so the sort ViewChild is available
    this.cd.detectChanges();
    this.initDataSource();

    // detect changes so the table ViewChild is available and the data updates
    this.cd.detectChanges();
    if (this.table) {
      this.table.renderRows();
    }
  }
  get points(): Point[] {
    return this._points;
  }
  @Output() selectionChanged: EventEmitter<Point[]> = new EventEmitter();

  public filterForm: FormGroup;
  public geneName: string = '';
  public regulation: string = 'all';
  public onlySelection: boolean = false;

  // MatTable data source
  dataSource: MatTableDataSource<Point>;

  // Displayed columns in the MatTable
  displayedColumns: string[] = ['select', 'gene', 'y', 'padj', 'x', 'fc'];

  selection: SelectionModel<Point>;

  /**
   * When we hold shift to select a range of rows, we need to know the starting index.
   * This will reset to -1 on filtering and sorting, as the starting index will no longer be valid.
   */
  private shiftSelectionStartingIndex: number = -1;

  /**
   * The data that is currently rendered in the table. This is used to determine the shift selection starting index.
   */
  private renderedData: Point[] = [];

  reverseLog(base, val) {
    return Math.pow(base, val)
  }

  formatNumber(num: number): string {
    // scientific notation, with 3 decimal places
    return num.toExponential(3);
  }

  // Reference to MatSort for sorting
  @ViewChild(MatSort, {static: false}) sort: MatSort;
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @ViewChild(MatTable, {static: false}) table: MatTable<Point>;

  ngOnInit(): void {
    this.selectionObservable.subscribe(selection => {

      const selectedPoints = selection.points;

      if (!this.filterForm) {
        this.filterFormInit();
      }

      // when the selection clears, we want to show all points, including ones not in selection
      if (selectedPoints.length == 0 && this.filterForm) {
        this.filterForm.setValue({
          ...this.filterForm.value,
          'onlySelection': false
        })
      }
      this._selectedPoints = selectedPoints

      if (this.dataSource) {
        this.applyFilter()
      }
    })
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

  getFontWeight(point: Point) {
    if (this._selectedPoints.includes(point)) {
      return 'normal'
    }
    return 'normal'
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
    this.dataSource = new MatTableDataSource(this._points);
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.filterPredicate = this.getFilterPredicate();
    this.dataSource.sortingDataAccessor = this.sortingDataAccessor;
    this.dataSource.connect().subscribe((data) => {

      this.shiftSelectionStartingIndex = -1;
      this.renderedData = data
    })
  }

  handleShiftSelection(event: MouseEvent, row: Point) {
    // If the shift key is held, select all rows between the starting index and the current index
    if (event.shiftKey && this.shiftSelectionStartingIndex >= 0) {
      const start = Math.min(this.shiftSelectionStartingIndex, this.renderedData.indexOf(row));
      const end = Math.max(this.shiftSelectionStartingIndex, this.renderedData.indexOf(row));
      this.renderedData.slice(start + 1, end).forEach((point) => {
        this.selection.select(point);
      });
    }

    // If a label was just checked, update the starting index
    // If a label was just unchecked, reset the starting index to -1
    if (!this.selection.isSelected(row)) {
      this.shiftSelectionStartingIndex = this.renderedData.indexOf(row);
    } else {
      this.shiftSelectionStartingIndex = -1;
    }
  }

  /** Selects all rendered rows if they are not all selected; otherwise clear selection. */
  handleMasterCheckboxClick() {
    this.shiftSelectionStartingIndex = -1;
    if (!this.allRenderedRowsSelected() && this.renderedData.length > 250) {
      alert('To avoid performance issues, toggling all rows is disabled when more than 250 rows are visible. Please reduce the number of rows.');
      return;
    }

    this.allRenderedRowsSelected() ?
        this.selection.clear() :
        this.renderedData.forEach(row => this.selection.select(row));
  }

  filterFormInit() {
    this.filterForm = new FormGroup({
      geneName: new FormControl(''),
      regulation: new FormControl('all'),
      onlySelection: new FormControl(false)
    });
  }

  getFilterPredicate() {
    return (row: Point, filters: string) => {
      // split string per '$' to array
      const filterArray = filters.split('$');
      const geneName = filterArray[0];
      const regulation = filterArray[1];
      const onlySelection = filterArray[2] === "true"

      const matchFilter = [];

      // Fetch data from row
      const columnGene = row.gene;
      const columnRegulation = this.getGeneRegulation(row);
      const columnSelected = onlySelection ? this._selectedPoints.includes(row) : true

      // verify fetching data by our searching values
      const customFilterGeneName = columnGene.toLowerCase().includes(geneName.toLowerCase());
      const customFilterRegulation = columnRegulation === regulation || regulation === 'all';
      const customSelected = columnSelected;

      // push boolean values into array
      matchFilter.push(customFilterGeneName);
      matchFilter.push(customFilterRegulation);
      matchFilter.push(customSelected);

      // return true if all values in array are true
      // else return false
      return matchFilter.every(Boolean);
    };
  }

  applyFilter() {
    const geneName = this.filterForm.get('geneName').value;
    const regulation = this.filterForm.get("regulation").value;
    const onlySelection = this.filterForm.get("onlySelection").value;

    this.geneName = geneName === null ? '' : geneName;
    this.regulation = regulation === null ? 'all' : regulation;
    this.onlySelection = onlySelection;

    // create string of our searching values and split if by '$'
    const filterValue = geneName + '$' + regulation + '$' + onlySelection
    this.dataSource.filter = filterValue.trim();
  }

  public processingEnrichrRequest: boolean = false;
  openInEnrichr(event: MouseEvent) {
    event.stopPropagation();
    const genes = this.dataSource.filteredData.map(p => p.gene);
    const geneList = genes.join('\n');
    // Create FormData
    const formData = new FormData();

    formData.append('list', geneList);
    formData.append('description', 'Volcano Plot Genes');

    // make the request
    this.processingEnrichrRequest = true;
    this.http.post('https://maayanlab.cloud/Enrichr/addList', formData).subscribe((res) => {
      this.processingEnrichrRequest = false;
      const listId = res['shortId'];
      window.open(`https://maayanlab.cloud/Enrichr/enrich?dataset=${listId}`, '_blank');
    })
  }

  copyToClipboard(event: MouseEvent) {
    event.stopPropagation();
    const clipboardText = this.dataSource.filteredData.map(p => p.gene).join('\n');
    navigator.clipboard.writeText(clipboardText).then(() => {
      this._snackbar.open(`Copied ${this.dataSource.filteredData.length} genes to clipboard!`, '', {
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


  allRenderedRowsSelected() {
    for (let i = 0; i < this.renderedData.length; i++) {
      if (!this.selection.isSelected(this.renderedData[i])) {
        return false;
      }
    }

    return true;
  }

  constructor(public cd: ChangeDetectorRef, private _snackbar: MatSnackBar, private http: HttpClient) {}
}
