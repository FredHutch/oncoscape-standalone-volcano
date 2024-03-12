import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { BehaviorSubject, Observable, Subject, forkJoin } from "rxjs";
import { catchError, map } from "rxjs/operators";
import {
  WorkerResponse,
  StepResultType,
  Status,
  StepResponse,
  Job,
  Step,
} from "../worker/worker.service.types";
import { v4 as uuidv4 } from "uuid";

export enum DEAStep {
  LOAD = "load",
  PREPROCESS = "preprocess",
  DESEQ2 = "deseq2",
}

export type LoadStepPayload = {
  cohortA: any;
  cohortB: any;
  map: any;
  data: any;
};

export type PreprocessStepPayload = {
  expression_data: string;
  cohort_A: string;
  cohort_B: string;
};

export type Deseq2StepPayload = {
  counts: string;
  cohort_data: string;
};

type JobWithWorkerId = Job & { workerId: number };

@Injectable({
  providedIn: "root",
})
export class DEAService {
  private baseUrl = "http://127.0.0.1:3300"; // Replace with your actual API base URL

  public static instance: DEAService;

  private jobs: JobWithWorkerId[] = [];
  public jobs$: Subject<JobWithWorkerId[]> = new BehaviorSubject([]);

  constructor(private http: HttpClient) {
    DEAService.instance = this;
    window["reachableDEAService"] = this;
  }

  /**
   *
   * @param payload The payload to kick off the Deseq2 job with
   * @returns The ID of the job that was kicked off
   */
  public runDiffExpJob(payload: LoadStepPayload): string {
    const jobId = uuidv4();
    this.jobs.push({
      workerId: jobId,
      id: jobId,
      name: "DiffExp",
      status: Status.Queued,
      type: "differentialExpression",
      steps: [],
      creationTime: new Date(),
    });

    // queue up the steps
    // const loadStepId = this.createStep(jobId, DEAStep.LOAD);
    // const preprocessStepId = this.createStep(jobId, DEAStep.PREPROCESS);
    const deseq2StepId = this.createStep(jobId, DEAStep.DESEQ2);

    /** @returns should we continue (job was not cancelled and the step didn't fail) */
    const stepCleanup = (stepId: number, response: StepResponse): boolean => {
      // early exit if the job was cancelled
      if (this.getJobStatus(jobId) === Status.Cancelled) {
        return false;
      }

      // Finish the step. This will handle if the step failed
      this.finishStep(jobId, stepId, response);
      return response.success;
    };

    const runStep = <T>(
      step: (payload: T) => Observable<StepResponse>,
      stepId: number,
      payload: T
    ): Observable<{
      moveToNextStep: boolean;
      response: StepResponse;
    }> => {
      this.updateStepStatus(jobId, stepId, Status.Running);
      return step(payload).pipe(
        map((res: StepResponse) => {
          const moveToNextStep = stepCleanup(stepId, res);
          return {
            moveToNextStep,
            response: res,
          };
        })
      );
    };

    // mark the job as running
    this.updateJob(jobId, {
      ...this.jobs.find((j) => j.id === jobId),
      status: Status.Running,
    });

    runStep(this.pipeline.bind(this), deseq2StepId, payload).subscribe(
            ({ moveToNextStep, response }) => {
              if (!moveToNextStep) {
                return;
              }
              this.finishJob(jobId, Status.Success)
            }
          );

    // run the steps
    // runStep(this.load.bind(this), loadStepId, payload).subscribe(
    //   ({ moveToNextStep, response }) => {
    //     if (!moveToNextStep) {
    //       return;
    //     }
    //     runStep(
    //       this.preprocess.bind(this),
    //       preprocessStepId,
    //       response.result.data
    //     ).subscribe(({ moveToNextStep, response }) => {
    //       if (!moveToNextStep) {
    //         return;
    //       }
    //       runStep(this._deseq2.bind(this), deseq2StepId, response.result.data).subscribe(
    //         ({ moveToNextStep, response }) => {
    //           if (!moveToNextStep) {
    //             return;
    //           }
    //           this.finishJob(jobId, Status.Success)
    //         }
    //       );
    //     });
    //   }
    // );
    return jobId;
  }

  public cancelJob(jobId: number) {
    // mark all steps as cancelled
    this.jobs
      .find((job) => job.id === jobId)
      .steps.forEach((step) => {
        step.status = Status.Cancelled;
      });

    // mark the job as cancelled
    this.finishJob(jobId, Status.Cancelled);
  }

  public deleteJob(jobId: number) {
    const job = this.jobs.find((job) => job.id === jobId);
    if (job) {
      this.jobs = this.jobs.filter((job) => job.id !== jobId);
      this.jobs$.next(this.jobs);
    }
  }

  private finishJob(jobId: number, status: Status) {
    const currJob = this.jobs.find((j) => j.id === jobId);
    if (!currJob) {
      console.error("Could not find job with ID", jobId);
      return;
    }
    this.updateJob(jobId, {
      ...currJob,
      status: status,
      finishTime: new Date(),
    });
  }

  /**
   * Updates the list of jobs with the given job, replacing any existing job with the same ID. This will also cause an emission of jobs$.
   * @param jobId the ID of the job to update
   * @param job the updated job information
   */
  private updateJob(jobId: number, job: JobWithWorkerId) {
    this.jobs = this.jobs.map((j) => {
      if (j.id === jobId) {
        return job;
      }
      return j;
    });

    this.jobs$.next(this.jobs);
  }

  private updateStepStatus(jobId: number, stepId: number, status: Status) {
    const currJob = this.jobs.find((j) => j.id === jobId);
    if (!currJob) {
      console.error("Could not find job with ID", jobId);
      return;
    }
    const currStep = currJob.steps.find((s) => s.id === stepId);
    if (!currStep) {
      console.error("Could not find step with ID", stepId);
      return;
    }
    this.updateJob(jobId, {
      ...currJob,
      steps: currJob.steps.map((s) => {
        if (s.id === stepId) {
          return {
            ...s,
            status: status,
          };
        }
        return s;
      }),
    });
  }

  private getJobStatus(jobId: number): Status {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) {
      console.error("Could not find job with ID", jobId);
      return Status.Error;
    }
    return job.status;
  }

  private createStep(jobId: number, type: DEAStep): number {
    const stepId = uuidv4();
    this.jobs = this.jobs.map((j) => {
      if (j.id !== jobId) {
        return j;
      }
      return {
        ...j,
        steps: [
          ...j.steps,
          {
            id: stepId,
            name: type.toString(),
            logs: [],
            status: Status.Queued,
            type: type,
            creationTime: new Date(),
          } as Step<any>,
        ],
      };
    });
    return stepId;
  }

  private finishStep(jobId: number, stepId: number, response: StepResponse) {
    const currJob = this.jobs.find((j) => j.id === jobId);
    if (!currJob) {
      console.error("Could not find job with ID", jobId);
      return;
    }
    const currStep = currJob.steps.find((s) => s.id === stepId);
    if (!currStep) {
      console.error("Could not find step with ID", stepId);
      return;
    }
    this.updateJob(jobId, {
      ...currJob,
      steps: [
        ...currJob.steps.filter((s) => s.id !== stepId),
        {
          ...currStep,
          status: response.success ? Status.Success : Status.Error,
          finishTime: new Date(),
          result: response.result,
        },

        // sort the steps by their finish time
      ].sort((a, b) => {
        const aFinishTime = a.finishTime !== undefined ? a.finishTime.getTime() : -1;
        const bFinishTime = b.finishTime!== undefined? b.finishTime.getTime() : -1;
        return aFinishTime - bFinishTime;

      }),
    });


    if (!response.success) {
      this.finishJob(jobId, Status.Error);
    }
  }

  private pipeline(payload: any): Observable<StepResponse> {

    return this.http.post(`${this.baseUrl}/pipeline`, JSON.stringify(payload)).pipe(
      map((response: any) => {
        console.log("RESPONSE DATA", response.data)
        let final = {}
        Object.keys(response.data[0]).forEach((col: string) => {
          if (final[col] === undefined) {
            final[col] = {}
          }
          response.data.forEach((row: any) => {
            final[col][row["_row"]] = row[col]
          })
        })

        console.log("FINAL DATA", final)

        // transform response to what we want


        const res: StepResponse = {
          success: true,
          result: {
            type: StepResultType.VOLCANO_DATA,
            data: final
          },
        };
        return res;
      }),
      catchError((error) => {
        console.log("ERROR", error)
        return this.handleError(error);
      })
    );
  }

  private load(payload: LoadStepPayload): Observable<StepResponse> {
    return this.http.post(`${this.baseUrl}/load`, payload).pipe(
      map((response: any) => {
        const res: StepResponse = {
          success: true,
          result: {
            type: StepResultType.JSON,
            data: response.data,
          },
        };
        return res;
      }),
      catchError((error) => {
        return this.handleError(error);
      })
    );
  }

  private preprocess(payload: PreprocessStepPayload): Observable<StepResponse> {
    return this.http.post(`${this.baseUrl}/preprocess`, payload).pipe(
      map((response: any) => {
        const res: StepResponse = {
          success: true,
          result: {
            type: StepResultType.JSON,
            data: response.data,
          },
        };
        return res;
      }),
      catchError((error) => {
        return this.handleError(error);
      })
    );
  }

  private _deseq2(payload: Deseq2StepPayload): Observable<StepResponse> {
    return this.http.post(`${this.baseUrl}/deseq2`, payload).pipe(
      map((response: any) => {
        const res: StepResponse = {
          success: true,
          result: {
            type: StepResultType.VOLCANO_DATA,
            // need to parse the final step, since it is not being passed back to the server,
            // but rather being used as JSON in the Angular app
            data: JSON.parse(response.data),
          },
        };
        return res;
      }),
      catchError((error) => {
        return this.handleError(error);
      })
    );
  }

  private handleError(error: any): Observable<StepResponse> {
    return new Observable((observer) => {
      observer.next({
        success: false,
        result: {
          type: StepResultType.Error,
          data: error,
        },
      });
      observer.complete();
    });
  }
}
