import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { PlotDownloadService, DownloadPlotFileType } from 'app/service/plot-download.service';

@Component({
  selector: 'app-download-plot',
  templateUrl: './download-plot.component.html',
  styleUrls: ['./download-plot.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadPlotComponent implements OnInit {

  @Input() plotSvgId: string;

  @Input() disabled: boolean = false;

  /** Different than plotSvgId. This should be the type of plot, such as "volcano" or "GSEA". It should be unique to the page if there are multiple rendered downloadable plots. */
  @Input() plotId: string;

  public downloadLinkId: string = "download-plot-link";

  public downloadPlotType: DownloadPlotFileType = DownloadPlotFileType.SVG;

  /** Invoke the download of the plot. Optionally override the download plot type which is internally managed from the form. */
  public download(downloadPlotType: DownloadPlotFileType = this.downloadPlotType) {
    this.plotDownloader.download(this.plotSvgId, this.plotId, downloadPlotType);
  }

  ngOnInit() {
    this.downloadLinkId = `download-link-${this.plotId}`
  }

  constructor(private plotDownloader: PlotDownloadService) {}
}
