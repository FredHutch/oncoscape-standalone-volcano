import { Injectable } from "@angular/core";
import {
  MatSnackBar,
  MatSnackBarConfig,
  MatSnackBarRef,
  SimpleSnackBar,
} from "@angular/material";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class PythonService {
  private snackbarConfig: MatSnackBarConfig<any> = {
    horizontalPosition: "right",
    verticalPosition: "top",
  };

  private _workers: {
    id: number;
    worker: Worker;
    name?: string;
    busy: boolean;
  }[] = [];

  private logs: string[] = []

  /**
   * Creates a new worker and returns the id of the worker
   * @returns The id of the worker
   */
  public newWorker(name?: string): number {
    const worker = new Worker("assets/scripts/pyodide-webworker.js");
    this._workers.push({ id: this._workers.length, worker, name, busy: false });
    return this._workers.length - 1;
  }

  /**
   * @param workerId ID of the worker to get the status of
   * @returns An observable that emits the status of the worker (true = busy) every 100ms
   */
  public workerStatus$(workerId: number): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      const interval = setInterval(() => {
        observer.next(this._workers[workerId].busy);
      }, 100);
      return () => {
        clearInterval(interval);
      };
    });
  }

  public logs$(): Observable<string> {
    return new Observable<string>((observer) => {
      const interval = setInterval(() => {
        if (this.logs.length > 0) {
          observer.next(this.logs.shift());
        }
      }, 100);
      return () => {
        clearInterval(interval);
      };
    });
  }




  /**
   * Installs the given dependencies in the given worker. The worker must have been created with `newWorker()`. Will display a snackbar while the dependencies are being installed, as well as success or error.
   * @param workerId ID of the worker to install the dependencies
   * @param deps List of dependencies to install
   */
  public async installDeps(workerId: number, deps: string[], method: "pyodide" | "micropip" = "pyodide", showSnackbar = true): Promise<void> {
    let snackbarRef: MatSnackBarRef<SimpleSnackBar>;

    if (showSnackbar) {
      snackbarRef = this._snackbar.open(
        "Loading Python dependencies...",
        "",
        this.snackbarConfig
      );
    }
    const worker = this._workers[workerId].worker;
    this._workers[workerId].busy = true;
    worker.postMessage({ cmd: "install", data: {
      deps,
      method
    } });
    worker.onmessage = (event) => {
      if (event.data.cmd === "done") {
        if (showSnackbar) {
          snackbarRef.dismiss();
          this._snackbar.open("Python dependencies loaded!", "Close", {
            ...this.snackbarConfig,
            duration: 5000,
          });
        }
      } else if (event.data.cmd === "error") {
        if (showSnackbar) {
          snackbarRef.dismiss();
          this._snackbar.open("Error loading Python dependencies", "Close", {
            ...this.snackbarConfig,
            duration: 5000,
          });
        }
        console.error(event.data.data);
      }
      this._workers[workerId].busy = false;
    };
  }

  public getWorkerIDByName(name: string): number {
    return this._workers.findIndex((worker) => worker.name === name);
  }

  /**
   *
   * @param workerId ID of the worker to run the Python code
   * @param filePath Path to the Python file to run
   * @param jobName Name of the job to display in the snackbar
   * @param payload Payload to send to the Python file. Will be made available as a global variable called `js_payload`
   * @returns
   */
  public async runPython(
    workerId: number,
    filePath: string,
    jobName = "Python",
    payload: any = {}
  ): Promise<{
    success: boolean;
    /**
     * The result of the Python code. This is the last value in the Python code, as if it were an interactive Python session. null if there was an error.
     */
    result: any;

    /**
     * The error message, if any.
     */
    error?: string;
  }> {
    let result = "";
    let snackbarRef: MatSnackBarRef<SimpleSnackBar>;
    let snackbarRefJob: MatSnackBarRef<SimpleSnackBar>;
    try {
      snackbarRef = this._snackbar.open("Error Loading Python file", "Close", {
        ...this.snackbarConfig,
        duration: 5000,
      });
      snackbarRefJob = this._snackbar.open(
        `Running Python job: ${jobName}`,
        "",
        { duration: 5000, ...this.snackbarConfig }
      );
      result = await new Promise<string>((resolve, reject) => {
        const worker = this._workers[workerId].worker;
        this._workers[workerId].busy = true;
        worker.postMessage({ cmd: "run", fp: filePath, payload: payload });
        worker.onmessage = (event) => {
          if (event.data.cmd === "done") {
            this._workers[workerId].busy = false;
            resolve(event.data.data);
          } else if (event.data.cmd === "error") {
            this._workers[workerId].busy = false;
            reject(event.data.data);
          } else if (event.data.cmd === 'log') {
            console.log('from angular:', event.data.data);
            this.logs.push(event.data.data);
          }
        };
      });
    } catch (error) {
      this._snackbar.open("Error running Python code", "Close", {
        duration: 5000,
        ...this.snackbarConfig,
      });
      console.error(error);
      return {
        success: false,
        result: null,
        error: error,
      };
    }

    snackbarRefJob.dismiss();

    if (result !== "") {
      this._snackbar.open(`Job completed: ${jobName}`, "Close", {
        duration: 5000,
        ...this.snackbarConfig,
      });
      return {
        success: true,
        result: result,
      };
    }
  }

  constructor(private _snackbar: MatSnackBar) {}
}
