import { Injectable } from "@angular/core";
import {
  MatSnackBar,
} from "@angular/material";
import { WorkerService } from "./worker/worker.service";
import { CsvLoaderService } from "./csv-loader.service";
// import { Store } from "@ngrx/store";
// import * as fromRoot from "app/reducer/index.reducer";
// import { DataService } from "./data.service";

export type DiffExpPayloads =
  | {
      cmd: "install";
      data: {
        deps: string[];
        method: "pyodide" | "micropip";
      };
    }
  | {
      cmd: "run";
      data: {
        fp: string;
        data: Object;
      };
    };

@Injectable({
  providedIn: "root",
})
export class PythonService extends WorkerService {
  protected workerScript = "assets/scripts/pyodide-webworker.js";

  public static instance: PythonService;
  constructor(_snackbar: MatSnackBar, csv: CsvLoaderService) {
    super(_snackbar, csv);

    PythonService.instance = this;

    window["reachablePythonService"] = this;
  }
}
