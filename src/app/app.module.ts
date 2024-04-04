import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";

import { AppComponent } from "./app.component";
import { ScientificPipe } from "./pipe/scientific.pipe";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatButtonModule } from "@angular/material/button";
import { MatTableModule } from "@angular/material/table";
import { MatSortModule } from "@angular/material";
import { MatCheckboxModule } from "@angular/material";
import { MatIconModule } from "@angular/material";
import { MatTooltipModule } from "@angular/material";
import { MatFormFieldModule } from "@angular/material";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButtonToggleModule } from "@angular/material";
import { VolcanoComponent } from "./component/volcano/volcano.component";
import { VolcanoGeneTableComponent } from "./component/volcano/volcano-gene-table/volcano-gene-table.component";
import { CsvLoaderService } from "./service/csv-loader.service";
import { HttpClient, HttpClientModule } from "@angular/common/http";
import { FileUploadComponent } from "./component/file-upload/file-upload.component";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatDividerModule } from "@angular/material/divider";
import { MatDialogModule } from "@angular/material";
import { PythonService } from "./service/python.service";
import { WorkerService } from "./service/worker/worker.service";
import { EnrichmentAnalysisService } from "./service/enrichment-analysis/enrichment-analysis.service";
import { JobTableComponent } from "./component/job-table/job-table.component";
import { DeleteJobDialogComponent } from "./component/job-table/delete-job-dialog/delete-job-dialog.component";
import { CancelJobDialogComponent } from "./component/job-table/cancel-job-dialog/cancel-job-dialog.component";
import { StatusIconComponent } from "./component/job-table/status-icon/status-icon.component";
import { DeaInputComponent } from "./component/dea-input/dea-input.component";
import { TextFieldModule } from "@angular/cdk/text-field";
import { MatSelectModule } from "@angular/material/select";
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatSliderModule } from "@angular/material";
import { MatTabsModule } from "@angular/material/tabs";
import { EnrichmentAnalysisComponent } from "./component/enrichment-analysis/enrichment-analysis.component";
import { VolcanoLayoutManagerService } from "./service/volcano-layout-manager.service";
import { PlotDownloadService } from "./service/plot-download.service";
import { DownloadPlotComponent } from "./component/download-plot/download-plot.component";

@NgModule({
  declarations: [
    AppComponent,
    ScientificPipe,
    VolcanoComponent,
    VolcanoGeneTableComponent,
    FileUploadComponent,
    JobTableComponent,
    DeleteJobDialogComponent,
    CancelJobDialogComponent,
    StatusIconComponent,
    DeaInputComponent,
    EnrichmentAnalysisComponent,
    DownloadPlotComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatSnackBarModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatButtonToggleModule,
    HttpClientModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatDividerModule,
    FormsModule,
    MatDialogModule,
    TextFieldModule,
    MatSelectModule,
    MatPaginatorModule,
    MatSliderModule,
    MatTabsModule,
    MatSlideToggleModule,
  ],
  providers: [
    CsvLoaderService,
    HttpClient,
    PythonService,
    WorkerService,
    EnrichmentAnalysisService,
    VolcanoLayoutManagerService,
    PlotDownloadService
  ],
  bootstrap: [AppComponent],
  entryComponents: [DeleteJobDialogComponent, CancelJobDialogComponent],
})
export class AppModule {}
