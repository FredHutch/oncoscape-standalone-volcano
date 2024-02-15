import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { ScientificPipe } from './pipe/scientific.pipe';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material';
import { MatCheckboxModule } from '@angular/material';
import { MatIconModule } from '@angular/material';
import { MatTooltipModule } from '@angular/material';
import { MatFormFieldModule } from '@angular/material';
import {MatInputModule} from '@angular/material/input';
import {ReactiveFormsModule} from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material';
import { VolcanoComponent } from './component/volcano/volcano.component';
import { VolcanoGeneTableComponent } from './component/volcano/volcano-gene-table/volcano-gene-table.component';
import { CsvLoaderService } from './service/csv-loader.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CsvUploadComponent } from './component/csv-upload/csv-upload.component';

@NgModule({
  declarations: [
    AppComponent,
    ScientificPipe,
    VolcanoComponent,
    VolcanoGeneTableComponent,
    CsvUploadComponent
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
    HttpClientModule
  ],
  providers: [
    CsvLoaderService,
    HttpClient,
  ],
  bootstrap: [AppComponent],
})
export class AppModule { }
