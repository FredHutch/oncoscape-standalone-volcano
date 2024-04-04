import { Injectable } from '@angular/core';
import { svg } from 'd3';

export enum DownloadPlotFileType {
  SVG = "svg",
  PNG = "png"
}

@Injectable({
  providedIn: 'root'
})
export class PlotDownloadService {

  private svgId: string;
  private plotId: string;
  constructor() { }

  /**
   *
   * @param svgId ID of the SVG element to download
   * @param fileType File type to generate
   * @param plotId ID of the plot (used for naming the file, such as "volcano" or "GSEA")
   */
  download(svgId: string, plotId: string, fileType: DownloadPlotFileType) {
    this.svgId = svgId;
    this.plotId = plotId;
    switch (fileType) {
      case DownloadPlotFileType.SVG:
        this.downloadAsSVG();
        break;
      case DownloadPlotFileType.PNG:
        this.downloadAsPNG();
        break;
      default:
        console.error("Invalid download type");
        break;
    }
    this.svgId = null;
    this.plotId = null;
  }

  private getSVG(): HTMLElement {
    // get SVG element
    var svg = document.getElementById(this.svgId)
    if (!svg) {
      console.error("SVG element not found with ID: ", this.svgId);
      return;
    }
    console.log(svg)
    return svg
  }

  private downloadAsPNG() {

    const svg = this.getSVG();

    try {
      // get SVG source
      var serializer = new XMLSerializer();
      var source = serializer.serializeToString(svg);

      // add namespaces
      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }
      if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
        );
      }

      // add XML declaration
      source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

      // create a Blob from the SVG source
      var blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });

      // create an image element
      var img = new Image();

      // create a data URL from the Blob
      var url = URL.createObjectURL(blob);

      // set the image source to the SVG data URL
      img.src = url;

      // create a canvas
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d");

      // set canvas dimensions to match the SVG
      // @ts-ignore
      canvas.width = svg.width.baseVal.value;
      // @ts-ignore
      canvas.height = svg.height.baseVal.value;

      // set background to white
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const self = this;

      // wait for the image to load before drawing on the canvas
      img.onload = function () {
        // draw the image onto the canvas
        context.drawImage(img, 0, 0);

        // convert canvas content to data URL in PNG format
        var pngUrl = canvas.toDataURL("image/png");

        // set the PNG data URL as the href attribute of the download link
        var saveLink = document.getElementById(
          `download-link-${self.plotId}`
        ) as HTMLAnchorElement;
        if (saveLink) {
          saveLink.href = pngUrl;
          saveLink.download = `${self.plotId}-plot-${new Date().toISOString()}.png`;
        }
      };
    } catch (error) {
      console.error("Error downloading PNG: ", error);
    }
  }

  private downloadAsSVG() {
    const svg = this.getSVG();

    try {
      //get svg source.
      var serializer = new XMLSerializer();
      var source = serializer.serializeToString(svg);

      // get svg source.
      var serializer = new XMLSerializer();
      var source = serializer.serializeToString(svg);

      // add name spaces.
      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }
      if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
        );
      }

      // add xml declaration
      source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

      // convert svg source to URI data scheme.
      var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);

      // set url value to the download link's href attribute.
      var dLink = document.getElementById(`download-link-${this.plotId}`) as HTMLAnchorElement;
      if (dLink) {
        dLink.href = url;
        dLink.download = `${this.plotId}-plot-${new Date().toISOString()}.svg`;
      }
    } catch (error) {
      console.error("Error downloading SVG: ", error);
    }
  }
}
