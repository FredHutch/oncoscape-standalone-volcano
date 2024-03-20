import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ViewChild,
  ViewRef,
} from "@angular/core";
import { MatDialog, MatTable } from "@angular/material";
import {
  Job,
  JobType,
  LogLevel,
  JobWithWorkerId
} from "app/service/worker/worker.service.types";
import { PythonService } from "app/service/python.service";
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from "@angular/animations";
import { CancelJobDialogComponent } from "./cancel-job-dialog/cancel-job-dialog.component";
import { DeleteJobDialogComponent } from "./delete-job-dialog/delete-job-dialog.component";
import { Subject } from "rxjs";
// import 'rxjs/add/operator/takeUntil';
import { takeUntil } from "rxjs/operators"
import { DEAService } from "app/service/dea/dea.service";
import { WorkerService } from "app/service/worker/worker.service";

type RowElement = Job & {
  workerId: number;
  source: 'session' | 'db';
};

@Component({
  selector: "app-job-table",
  templateUrl: "./job-table.component.html",
  styleUrls: ["./job-table.component.scss"],
  animations: [
    trigger("detailExpand", [
      state("collapsed,void", style({ height: "0px", minHeight: "0" })),
      state("expanded", style({ height: "*" })),
      transition(
        "expanded <=> collapsed",
        animate("225ms cubic-bezier(0.4, 0.0, 0.2, 1)")
      ),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class JobTableComponent implements AfterViewInit, OnDestroy {

  // list of jobs, along with the workerId that is running them
  jobs: RowElement[] = [];
  columnsToDisplay = ["name", "finishTime", "status", "cancelOrDelete"];
  columnsToDisplayWithExpand = [...this.columnsToDisplay, "expand"];
  expandedElement: RowElement | null;

  private ngUnsubscribe = new Subject();

  @Input() jobType: JobType;

  @ViewChild(MatTable, { static: false }) table: MatTable<RowElement>;

  onJobCancelOpenDialog(jobId: number) {
    const jobName = this.jobs.find((job) => job.id === jobId).name;
    const dialogRef = this.dialog.open(CancelJobDialogComponent, {
      data: { jobName },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // cancel the job
        const workerId = this.jobs.find((job) => job.id === jobId).workerId;

        // TODO: this should be done by calling the worker service, not the Python service
        const res = PythonService.instance.terminateWorker(workerId);

        // display error message if failed to cancel job
        if (!res.success) {
          console.error(res.error);
          alert("Failed to cancel job.");
          return;
        }

        // post-cancel cleanup
        console.warn(`Job ${jobId} cancelled on worker ${workerId}`);
        // this.defensiveDetectChanges();
      }
    });
  }

  onJobDeleteOpenDialog(jobId: number) {
    const job = this.jobs.find((job) => job.id === jobId);
    const dialogRef = this.dialog.open(DeleteJobDialogComponent, {
      data: { jobName: job.name },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        // delete the job
        const res = await PythonService.instance.deleteJob(job);

        // display error message if failed to delete job
        if (!res.success) {
          console.error(res.error);
          alert("Failed to delete job.");
          return;
        }

        // post-delete cleanup
        console.warn(`Job ${jobId} deleted`);
        // this.defensiveDetectChanges();
      }
    });
  }

  toggleExpandedRow(rowElement: RowElement) {
    this.expandedElement = this.elementsAreEqual(
      rowElement,
      this.expandedElement
    )
      ? null
      : rowElement;
  }

  elementsAreEqual(e1: RowElement, e2: RowElement) {
    if (e1 === null || e2 === null) {
      return false;
    }
    return (
      this.expandedElement && e1.id === e2.id && e1.workerId === e2.workerId
    );
  }

  getLogColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.Info:
        return "black";
      case LogLevel.Warn:
        return "orange";
      case LogLevel.Error:
        return "red";
      default:
        return "black";
    }
  }

  canCancel(job: Job): boolean {
    return job.status === "running" || job.status === "queued";
  }

  canDelete(job: Job): boolean {
    return (
      job.status === "success" ||
      job.status === "cancelled" ||
      job.status === "error"
    );
  }

  /**
   * We need to wrap detectChanges in defensive logic to check if the view has been destroyed (the panel has been closed)
   */
  defensiveDetectChanges() {
    if (
      this.cd !== null &&
      this.cd !== undefined &&
      !(this.cd as ViewRef).destroyed
    ) {
      this.cd.detectChanges();
    }
  }

  private jobsAreEqual(j1: RowElement, j2: RowElement) {
    if (j1 === null || j2 === null || j1 === undefined || j2 === undefined) {
      return false;
    }
    const sameNumSteps = j1.steps.length === j2.steps.length;
    if (!sameNumSteps) {
      return false;
    }
    const sameNumOfLogs = j1.steps.every(
      (step, i) => step.logs.length === j2.steps[i].logs.length
    );
    const stepStatusMatch = j1.steps.every(
      (step, i) => step.status === j2.steps[i].status
    );
    const jobStatusMatch = j1.status === j2.status;
    const idMatch = j1.id === j2.id;
    const workerIdMatch = j1.workerId === j2.workerId;

    return (
      stepStatusMatch &&
      jobStatusMatch &&
      idMatch &&
      workerIdMatch &&
      sameNumSteps &&
      sameNumOfLogs
    );
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  private updateJobs(updatedJobs: JobWithWorkerId[], source: 'session' | 'db') {

    // combine the new jobs with the old jobs, replacing jobs with matching ids with the new jobs
    const updatedJobsWithSource: RowElement[] = updatedJobs.map((newJob) => ({...newJob, source}));

    // combine the new jobs with the old jobs, discarding any old jobs of the same source
    this.jobs = [
      ...updatedJobsWithSource,
      ...this.jobs.filter((oldJob) => oldJob.source !== source)
    ]
    // sort jobs by creation time
    .sort((a, b) => {
      if (a.creationTime < b.creationTime) {
        return 1;
      } else if (a.creationTime > b.creationTime) {
        return -1;
      } else {
        return 0;
      }
    });

    this.defensiveDetectChanges();
    // if (this.table) {
    //   this.table.renderRows();
    // }
    // this.defensiveDetectChanges();
  }

  ngAfterViewInit() {
    // this.dexieSubscription = PythonService.instance.dbJobsOfType$(this.jobType)
    // .subscribe((jobs) => {
    //     // console.log(`Database jobs of type ${this.jobType} have updated`, jobs);

    //     // Worker ids get lost when a job is stored in the database, so we need to add them back in as undefined
    //     const jobsWithWorkerIds: JobWithWorkerId[] = jobs.map((job) => {
    //       return { ...job, workerId: undefined };
    //     })

    //     this.updateJobs(jobsWithWorkerIds, 'db')
    //   });

    let firstRender = true;

    PythonService.instance.sessionJobs$.subscribe((jobs) => {
      console.log(`Session jobs have updated`, jobs);
      this.updateJobs(jobs, 'session')
      if (firstRender && this.expandedElement === undefined && this.jobs.length > 0) {
        firstRender = false;
        this.expandedElement = this.jobs[0];
      }
    })

    DEAService.instance.jobs$.subscribe((jobs) => {
      console.log(`Session jobs have updated`, jobs);
      this.updateJobs(jobs, 'session')
      if (firstRender && this.expandedElement === undefined && this.jobs.length > 0) {
        firstRender = false;
        this.expandedElement = this.jobs[0];
      }
    })
  }

  constructor(private cd: ChangeDetectorRef, public dialog: MatDialog) {}
}
