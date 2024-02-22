import { CsvLoaderService } from 'app/service/csv-loader.service';
import { Injectable, OnDestroy, OnInit } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from "@angular/material";
import {
  IWorkerService,
  JobOptions,
  IWorker,
  JobType,
  Step,
  StepInput,
  StepResponse,
  Job,
  Status,
  GenericPayload,
  StepResultType,
  LogLevel,
} from "./worker.service.types";
import { Observable, combineLatest, of, interval, Subject, BehaviorSubject } from "rxjs";
// import { Observable as DexieObservable } from "dexie";
// import { Khonsole } from "app/khonsole";
import { v4 as uuidv4 } from "uuid";
// import { WorkspaceComponent } from "app/component/workspace/workspace.component";
// import { Store } from "@ngrx/store";
// import * as fromRoot from "app/reducer/index.reducer";
import { map } from "rxjs/operators";
// import { DataService } from "../data.service";
// import Dexie, {liveQuery} from "dexie";

type JobWithWorkerId = Job & { workerId: number };


@Injectable({
  providedIn: "root",
})
export class WorkerService implements IWorkerService, OnDestroy, OnInit {
  public static DEFAULT_OPTIONS: JobOptions = {
    type: "generic",
    showSnackbarOnStart: true,
    showSnackbarOnSuccess: true,
    onSuccessSnackbarClick: null,
    showSnackbarOnFail: true,
    onFailSnackbarClick: null,
    saveToDatabase: false,
    freeWorkerOnFinish: true,
    destroyWorkerOnFinish: false, // TODO: reuse workers that have a consistent use (for example, python deseq) by default instead of destroying them
  };

  public sessionJobs$: Subject<JobWithWorkerId[]> = new BehaviorSubject([]);

  protected _workers: IWorker[] = [];

  /**
   * Former completed jobs from the IndexedDB. These are jobs that have been run in the past and are saved in the database.
   */
  // protected _dbJobs: Job[] = [];

  /**
   * The script to run in the worker. The worker must be able to handle messages of the form:
   * ```ts
   * {
   *  cmd: string;
   *  data: any;
   * }
   * ```
   *
   * It should respond with a message of the form:
   * ```ts
   * {
   * status: "success" | "error";
   * data: any | null;
   * }
   * ```
   *
   * If a step does not return any data, it should return `null` as the data, as the data needs to be JSON serializable.
   *
   */
  protected workerScript: string;

  private snackbarConfig: MatSnackBarConfig<any> = {
    horizontalPosition: "right",
    verticalPosition: "top",
  };

  private DEMO_FINISHED_JOB: Job;

  newWorker(): {
    success: boolean;
    workerId: number;
    error?: string;
  } {
    try {
      const worker = new Worker(this.workerScript);
      const workerId = uuidv4();
      this._workers.push({
        id: workerId,
        worker,
        busy: false,
        jobs: [],
      });
      return {
        success: true,
        workerId: workerId,
      };
    } catch (e) {
      return {
        success: false,
        workerId: -1,
        error: e,
      };
    }
  }

  isWorkerBusy$(workerId: number): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      const interval = setInterval(() => {
        observer.next(this.getWorker(workerId).busy);
      }, 1000);
      return () => {
        clearInterval(interval);
      };
    });
  }

  workerJobs$(workerId: number): Observable<Job[]> {
    return new Observable<Job[]>((observer) => {
      const interval = setInterval(() => {
        observer.next(this.getWorker(workerId).jobs);
      }, 1000);
      return () => {
        clearInterval(interval);
      };
    });
  }

  /**
   * Get jobs from the database. These are jobs that were run in past sessions.
   * @param type The type of job to get from the database
   * @returns Jobs of the given type from the database
   */
  // dbJobsOfType$(type: JobType): DexieObservable<Job[]> {
  //   return liveQuery(async () => {
  //     const config = await this.store
  //     .select(fromRoot.getGraphAConfig)
  //     .pipe(first())
  //     .toPromise();

  //   const db = await new Dexie('notitia-' + config.database).open()

  //   return (await db.table('jobs').where('type').equals(type).toArray()).map(j => ({...j, workerId: undefined}))
  //   })
  // }

  sessionJobsOfType$(type: JobType): Observable<JobWithWorkerId[]> {
    return this.sessionJobs$.pipe(
      map(jobs => jobs.filter(j => j.type === type))
    );
  }

  // /**
  //  *
  //  * @param type Type of job to get
  //  * @param includeDBJobs Whether to include jobs from the database
  //  * @returns An observable of all jobs of the given type, along with the worker ID of the worker that is running them
  //  * (undefined worker id for database jobs, since the workers no longer exist.)
  //  */
  // jobsOfType$(type: JobType, includeDBJobs = true): Observable<JobWithWorkerId[]> {

  //   if (includeDBJobs) {
  //     return combineLatest([
  //       this.dbJobsOfType$(type),
  //       this.sessionJobs$.pipe(
  //         map(jobs => jobs.filter(j => j.type === type))
  //       )
  //     ]).pipe(
  //       map(([dbJobs, sessionJobs]) => {
  //         // Build a set of unique job ids
  //         const uniqueJobIds = new Set();

  //         // Filter out duplicates and keep the latest occurrence from dbJobs
  //         // This happens when a job from the session completes and gets entered into the database.
  //         const combinedJobs = [...sessionJobs, ...dbJobs.reverse()].filter(job => {
  //           if (!uniqueJobIds.has(job.id)) {
  //             uniqueJobIds.add(job.id);
  //             return true;
  //           }

  //           return false;
  //         });

  //         // Reverse the combinedJobs array to maintain the original order
  //         return combinedJobs.reverse();
  //       }),
  //     );
  //   }

  //   return this.sessionJobs$.pipe(
  //     map(jobs => jobs.filter(j => j.type === type))
  //   )
  // }

  terminateWorker(workerId: any): { success: boolean; error?: any } {
    try {
      const worker = this.getWorker(workerId);
      worker.worker.terminate();
      worker.busy = false;
      worker.jobs.forEach((job) => {
        if (job.status === Status.Queued || job.status === Status.Running) {
          job.status = Status.Cancelled;
          job.finishTime = new Date();
          job.steps.forEach((step) => {
            if (
              step.status === Status.Queued ||
              step.status === Status.Running
            ) {
              step.status = Status.Cancelled;
              step.finishTime = new Date();
            }
          });
        }
      });
      this.sessionJobs$.next(this.jobsWithWorkerId());
      return { success: true };
    } catch (e) {
      return { success: false, error: e };
    }
  }

  deleteJob(job: Job): { success: boolean; error?: any } {
    try {
      // If the job is in the current session, delete it from the session
      for (let i = 0; i < this._workers.length; i++) {
        const index = this._workers[i].jobs.findIndex((j) => j.id === job.id);
        if (index !== -1) {
          this._workers[i].jobs.splice(index, 1);
          console.log(`Deleted job ${job.id} from session`);
          this.sessionJobs$.next(this.jobsWithWorkerId());
          return { success: true };
        }
      }

      // If the job is in the database, delete it from the database
      let found = false;
      // this.store
      //   .select(fromRoot.getGraphAConfig)
      //   .pipe(first())
      //   .subscribe((graphAConfig) => {
      //     console.log("deleting job from database", job, graphAConfig);
      //     WorkspaceComponent.instance.delJob({
      //       database: graphAConfig.database,
      //       job: job,
      //     });
      //     Khonsole.log(`Deleted job ${job.id} from database`);
      //     found = true;
      //     return;
      //   });
      if (found) {
        return { success: true };
      }

      return { success: false, error: `Could not delete Job ${job.id}. Not found`};
    }
    catch (e) {
        return { success: false, error: e };
    }
  }

  getJob(workerId: number, jobId: number): Job {
    return this.getWorker(workerId).jobs.find((job) => job.id === jobId);
  }

  getWorker(workerId: number): IWorker {
    return this._workers.find((worker) => worker.id === workerId);
  }

  async runJob<Payload extends GenericPayload>(
    workerId: number,
    name: string,
    initialPayload: Payload,
    steps: StepInput<Payload>[],
    options: Partial<JobOptions> = {}
  ): Promise<StepResponse[]> {
    const stepResponses: StepResponse[] = [];
    let payloadOrPrevStepResult: Payload | StepResponse["result"] =
      initialPayload;
    const jobId = uuidv4();
    const worker = this.getWorker(workerId);

    const finalOptions: JobOptions = {
      ...WorkerService.DEFAULT_OPTIONS,
      ...options,
    };

    console.log(
      `Running job "${name}" (${jobId}) on worker ${workerId} with options:`,
      finalOptions
    );

    const finalSteps: Step<Payload>[] = steps.map((step, i) => ({
      ...step,
      id: i,
      status: Status.Queued,
      logs: [],
      creationTime: new Date(),
    }));

    // add the job to the history,
    worker.jobs.push({
      id: jobId,
      name,
      steps: finalSteps,
      status: Status.Running,
      type: finalOptions.type,
      creationTime: new Date(),
    });
    this.sessionJobs$.next(this.jobsWithWorkerId());

    const job = this.getJob(workerId, jobId);

    // Show the startup snackbar
    if (finalOptions.showSnackbarOnStart) {
      this._snackbar.open(`Running job: ${name}`, "", {
        duration: 5000,
        ...this.snackbarConfig,
      });
    }

    for (let i = 0; i < finalSteps.length; i++) {
      const step = finalSteps[i];

      // run the step
      const response = await this.runStep<Payload>(
        workerId,
        step,
        payloadOrPrevStepResult
      );
      stepResponses.push(response);

      // if the step failed, do not continue with the rest of the steps
      if (!response.success) {
        if (finalOptions.showSnackbarOnFail) {
          this._snackbar.open(
            `Error running job "${name}". Failed on step "${step.name}"`,
            "Close",
            {
              duration: 5000,
              ...this.snackbarConfig,
            }
          );
        }

        this.finishJob(worker, job, Status.Error, finalOptions);
        return stepResponses;
      }

      // if the step succeeded, put the result in the payload for the next step
      payloadOrPrevStepResult = response.result;
    }

    if (finalOptions.showSnackbarOnSuccess) {
      this._snackbar.open(`Finished job "${name}"`, "Close", {
        duration: 5000,
        ...this.snackbarConfig,
      });
    }

    this.finishJob(worker, job, Status.Success, finalOptions);

    return stepResponses;
  }

  /**
   *
   * @param workerId The ID of the worker to run the step on
   * @param jobId The ID of the job to run the step on
   * @param step The step to run
   * @param payloadOrPrevStepResult The payload to run the step with. If the step has a `prevResultToPayload` function, this will be ignored.
   * @returns
   */
  private async runStep<Payload extends GenericPayload>(
    workerId: number,
    step: Step<Payload>,
    payloadOrPrevStepResult: Payload | StepResponse["result"]
  ): Promise<StepResponse> {
    const worker = this.getWorker(workerId).worker;

    // mark the step as running
    step.status = Status.Running;

    const response = await new Promise<StepResponse>((resolve, _) => {
      // set the payload, either from the provided payload or from the previous step's result
      if (step.payload) {
        payloadOrPrevStepResult = step.payload;
      } else {
        payloadOrPrevStepResult = step.prevResultToPayload
          ? step.prevResultToPayload(
              payloadOrPrevStepResult as StepResponse["result"]
            )
          : (payloadOrPrevStepResult as Payload);
      }

      // Run the step
      worker.postMessage(payloadOrPrevStepResult);

      // Handle the response
      worker.onmessage = (
        // event: MessageEvent<WorkerResponse> // Ideally we would use this type, but it doesn't work for some reason, even though MessageEvent is generic
        event: MessageEvent
      ) => {
        const response = event.data;

        // the status the worker responded with
        const status: Status = response.status;

        // The result of the step
        const dataOrErrorMsg: any = response.data;

        // The type of the result of the step
        const dataType: StepResultType = response.type;

        switch (status) {
          case Status.Success:
            resolve({
              success: true,
              result: {
                type: dataType,
                data: dataOrErrorMsg,
              },
            });
            break;
          case Status.Error:
            console.error(dataOrErrorMsg);
            resolve({
              success: false,
              result: {
                type: StepResultType.Error,
                data: dataOrErrorMsg,
              },
            });
            break;

          case Status.Log:
            const data = dataOrErrorMsg as {
              msg: string;
              level: LogLevel;
            };
            step.logs.push(data);
            this.sessionJobs$.next(this.jobsWithWorkerId());
            break;

          default:
            console.error(
              `Unknown status from worker "${status}". Must be "success" or "error"`
            );
            resolve({
              success: false,
              result: {
                type: StepResultType.Error,
                data: `Unknown status from worker "${status}". Must be "success" or "error"`,
              },
            });
            break;
        }
      };
    });

    this.finishStep(step, response);

    return response;
  }

  private jobsWithWorkerId(): JobWithWorkerId[] {
    return this._workers.reduce((acc, worker) => {
      return acc.concat(
        worker.jobs.map((job) => ({ ...job, workerId: worker.id }))
      );
    }, []);
  }

  private finishStep(step: Step<GenericPayload>, response: StepResponse) {
    step.finishTime = new Date();
    if (!response.success) {
      step.status = Status.Error;
      step.result = response.result;
      return;
    }

    step.status = Status.Success;

    if (response.result) {
      const typesToParse = [StepResultType.Table, StepResultType.JSON];

      step.result = {
        type: response.result.type,
        // Parse the data if it is a table
        data: typesToParse.includes(response.result.type)
          ? JSON.parse(response.result.data)
          : response.result.data,
      };
    }

    step.logs.push({
      msg: "Success",
      level: LogLevel.Info,
    });

    this.sessionJobs$.next(this.jobsWithWorkerId());
  }

  private async finishJob(
    worker: IWorker,
    job: Job,
    status: Status,
    options: JobOptions,
  ) {
    job.status = status;
    job.finishTime = new Date();

    console.log(
      `Job "${job.name}" (${job.id}) finished with status "${status}"`
    );

    this.sessionJobs$.next(this.jobsWithWorkerId());

    if (options.saveToDatabase) {
      job.steps.forEach((step) => {
        // remove the payload from the step before saving it to the database, since we don't need to save it and it could be large
        step.payload = null;
        step.prevResultToPayload = null;
      });
      // this.store
      //   .select(fromRoot.getGraphAConfig)
      //   .pipe(first())
      //   .subscribe((graphAConfig) => {
      //     console.log("saving job to database", job, graphAConfig);
      //     WorkspaceComponent.instance.addJob({
      //       database: graphAConfig.database,
      //       job: job,
      //     });

      //     // remove the job from the session
      //     const index = worker.jobs.findIndex((j) => j.id === job.id);
      //     if (index !== -1) {
      //       worker.jobs.splice(index, 1);
      //     }

      //     if (options.freeWorkerOnFinish) {
      //       worker.busy = false;
      //     }
      //     return;
      //   });
    }
    if (options.freeWorkerOnFinish) {
      worker.busy = false;
    }

    if (options.destroyWorkerOnFinish) {
      worker.worker.terminate();
      const index = this._workers.findIndex((w) => w.id === worker.id);
      if (index !== -1) {
        this._workers.splice(index, 1);
      }
    }
  }

  ngOnDestroy(): void {
  }

  ngOnInit() {

  }

  createDummyJob(data: any, name: string) {
    this._workers.push({
      id: uuidv4(),
      worker: new Worker("assets/scripts/pyodide-webworker.js"),
      busy: false,
      jobs: [{
        id: uuidv4(),
        name: name,
        steps: [
          {
            id: 1,
            name: "Create volcano plot",
            status: Status.Success,
            logs: [
            ],
            creationTime: new Date(),
            finishTime: new Date(),
            result: {
              type: StepResultType.VOLCANO_DATA,
              data: data
            }
          },
        ],
        status: Status.Success,
        type: "differentialExpression",
        creationTime: new Date(),
        finishTime: new Date(),
      }],
    });
    this.sessionJobs$.next(this.jobsWithWorkerId());
  }

  constructor(
    private _snackbar: MatSnackBar,
    private csv: CsvLoaderService
    // private store: Store<fromRoot.State>,
    // private ds: DataService
  ) {
  }
}
