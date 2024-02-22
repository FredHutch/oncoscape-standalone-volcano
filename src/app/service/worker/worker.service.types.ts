import { Observable } from "rxjs";

export type JobType = "differentialExpression" | "generic";


export enum Status {
  Running = "running",
  Success = "success",
  Error = "error",
  Queued = "queued",
  Cancelled = "cancelled",
  Log = "log",
}

export enum LogLevel {
  Log = "log",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export enum StepResultType {

  /**
   * The result is a table. The table will be displayed in a table component.
   * We expect the table to be in the following format:
   * ```ts
   *{
   * "col 1": {
   *     "row 1": "row1col1_value",
   *     "row 2": "row2col1_value"
   * },
   * "col 2": {
   *     "row 1": "row1col2_value",
   *     "row 2": "row2col2_value"
   * }
   * }
   * ```
   */
  Table = "table",
  Text = "text",
  Error = "error",
  JSON = "json",
  VOLCANO_DATA = "volcanoData",
}

export interface StepInput<Payload extends GenericPayload> {
  name: string;
  /**
   * A function that transforms the result of the previous step into a payload for this step. Should not be provided for the first step.
   */
  prevResultToPayload?: (result: any) => Payload;

  /**
   * You can directly provide a payload for this step instead of deriving it from the previous step.
   */
  payload?: Payload;
}

export interface Step<Payload extends GenericPayload> {
  id: number;
  name: string;
  status: Status;
  logs: { msg: string; level: LogLevel }[];
  result?: {
    /**
   * Defines the type of the result of the step. Used to determine how to use and display the result. sometimes null if we ahve a special status type that we know what to do with (e.g. log, error)
   */
    type: StepResultType | null;
    data: any;
  } | null;
  creationTime: Date;
  finishTime?: Date;
  /**
    * A function that transforms the result of the previous step into a payload for this step. Should not be provided for the first step.
   */
  prevResultToPayload?: (result: StepResponse["result"]) => Payload;
  /**
   * You can directly provide a payload for this step instead of deriving it from the previous step.
   */
  payload?: Payload;
}

export interface IWorker {
  id: number;
  worker: Worker;
  busy: boolean;
  jobs: Job[];
}

export type Job = {
  id: number;
  name: string;
  status: Status;
  type: JobType;
  steps: Step<GenericPayload>[];
  creationTime: Date;
  finishTime?: Date;
}
export type JobWithWorkerId = Job & { workerId: number };

export type GenericPayload = {
  cmd: string;
  data: any;
}

export type WorkerResponse = {
  status: "success" | "error";

  /**
   * This is the data that the worker returns. It can be anything, but it should be JSON-serializable.
   */
  data: any;

  /**
   * Metadata field to help us know a little more about the structure of the data.
   */
  type: StepResultType;
}

export type StepResponse = {

  /**
   * Whether the step succeeded.
   */
  success: boolean;


  /**
   * The result of the step. Can be null if no result was returned. If the step failed, this will be the error message.
   */
  result: {
    type: StepResultType;
    data: any;
  } | null;
};

export type JobOptions = {

  /**
   * The type of the job.
   */
  type: JobType;

  /**
   * Whether to show the snackbar when the job starts.
   */
  showSnackbarOnStart?: boolean;

  /**
   * Whether to show the snackbar when the job successfully finishes.
   */
  showSnackbarOnSuccess?: boolean;

  /**
   * Callback to attach to clicking the snackbar that appears when the job successfully finishes.
   */
  onSuccessSnackbarClick?: () => void;

  /**
   * Whether to show the snackbar when the job fails.
   */
  showSnackbarOnFail?: boolean;

  /**
   * Callback to attach to clicking the snackbar that appears when the job fails.
   */
  onFailSnackbarClick?: () => void;

  /**
   * Whether to save the result of the job to the database (will only save on success). Defaults to true.
   */
  saveToDatabase: boolean;

  /**
   * Whether to free the worker when the job finishes (successfully or not). Defaults to true.
   */
  freeWorkerOnFinish: boolean;

  /**
   * Whether to destroy the worker when the job finishes (successfully or not). Defaults to true.
   */
  destroyWorkerOnFinish: boolean;
};

export interface IWorkerService {
  /**
   * Creates a new worker and returns the id of the worker
   * @param name Name of the worker
   * @param type Type of the worker
   * @returns The id of the worker
   */
  newWorker(
    name: string,
    type: JobType
  ): {
    success: boolean;
    workerId: number;
    error?: string;
  };

  /**
   * @param workerId ID of the worker to get the status of
   * @returns An observable that emits the status of the worker (true = busy) every 100ms
   */
  isWorkerBusy$(workerId: number): Observable<boolean>;

  /**
   * @param workerId ID of the worker to get the jobs of
   * @returns An observable that emits the jobs of the worker every 1000ms
   */
  workerJobs$(workerId: number): Observable<Job[]>;

  // /**
  //  * @param type The type of jobs to get
  //  * @returns All jobs of the given type, across all workers. Each job is augmented with the workerId of the worker that is running the job.
  //  */
  // jobsOfType$(type: JobType): Observable<(Job & {workerId: number})[]>;

  /**
   * Terminate the worker with the given ID.
   * Jobs that are queued or running will be marked as cancelled, along with their steps.
   * @returns If the worker was successfully terminated:
   * ```ts
   * {success: true}
   * ```
   *
   * If there was an error:
   * ```ts
   * {success: false, error: "Error message"}
   *
   */
  terminateWorker(workerId): { success: boolean; error?: string };

  deleteJob(job: Job): { success: boolean; error?: string };

  /**
   *
   * @param workerId The ID of the worker to run the set of jobs on.
   * @param sequenceName The name of the sequence of jobs.
   * @param steps The steps to run.
   * @param options Options for the job. Snackbars will only display at the beginning and end of the job if `showSnackbarOnStart` and `showSnackbarOnSuccess/error` are true, respectively.
   */
  runJob(
    workerId: number,
    sequenceName: string,
    initialPayload: any,
    steps: StepInput<GenericPayload>[],
    options?: JobOptions
  );
}
