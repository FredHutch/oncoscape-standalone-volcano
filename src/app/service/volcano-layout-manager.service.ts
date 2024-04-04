import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

// volcano-layout-manager.service.ts
export enum VolcanoPanel {
  SelectByStats = "selectByStats",
  TableOptions = "tableOptions",
  EnrichmentAnalysisOptions = "enrichmentAnalysisOptions"
}

export enum VolcanoTab {
  Table = "table",
  EnrichmentAnalysis = "enrichmentAnalysis"
}

@Injectable({
  providedIn: 'root'
})
export class VolcanoLayoutManagerService {
  public activeTab: VolcanoTab = VolcanoTab.Table;
  private panelStates: Map<VolcanoPanel, boolean> = new Map();
  private _enabledTabs: VolcanoTab[] = [VolcanoTab.Table, VolcanoTab.EnrichmentAnalysis];
  public panelStates$: Subject<Map<VolcanoPanel, boolean>> = new Subject();
  private _isFullScreen = false;
  get isFullScreen(): boolean {
    return this._isFullScreen;
  }

  constructor() { }

  setPanelCollapsed(panel: VolcanoPanel, collapsed: boolean): void {
    this.panelStates.set(panel, collapsed);
    this.panelStates$.next(this.panelStates);
  }

  isPanelCollapsed(panel: VolcanoPanel): boolean {
    return this.panelStates.get(panel)
  }

  setEnabledTabs(tabs: VolcanoTab[]): void {
    this._enabledTabs = tabs;
  }

  private getPanelClientHeights(): { [key: string]: number } {

    const getHeightOrZero = (id: string): number => {
      const el = document.getElementById(id);
      return el ? el.clientHeight : 0;
    }

    return {
      [VolcanoPanel.SelectByStats]: getHeightOrZero("select-by-stats-panel"),
      [VolcanoPanel.TableOptions]: getHeightOrZero("table-options-panel"),
      [VolcanoPanel.EnrichmentAnalysisOptions]: getHeightOrZero("enrichment-analysis-options-panel")
    }
  }

  toggleFullScreen() {
    this._isFullScreen = !this._isFullScreen;

    if (this._isFullScreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }

  getAvailableHeightForActiveTab(padding=0): number {

    let maxHeight = document.getElementById("tabs-container").clientHeight;

    // get and subtract the height of the tab header
    const tabHeaderHeight = document.getElementsByTagName("mat-tab-header")[0].clientHeight;
    maxHeight -= tabHeaderHeight;

    // apply padding
    maxHeight -= padding;

    const panelHeights = this.getPanelClientHeights();
    maxHeight -= panelHeights[VolcanoPanel.SelectByStats]
    switch (this.activeTab) {
      case VolcanoTab.Table:
        return maxHeight - panelHeights[VolcanoPanel.TableOptions];
      case VolcanoTab.EnrichmentAnalysis:
        return maxHeight - panelHeights[VolcanoPanel.EnrichmentAnalysisOptions];
      default:
        return maxHeight;
    }
  }

  get enabledTabs(): VolcanoTab[] {
    return this._enabledTabs;
  }

  isTabEnabled(tab: VolcanoTab): boolean {
    return this._enabledTabs.includes(tab);
  }
}
