import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'scientific',
})
export class ScientificPipe implements PipeTransform {
  transform(value: number, args?: Array<string>): string {

    const precision = args && args.length > 0 ? parseInt(args[0]) : 3;
    const forceExponential = args && args.length > 1 ? args[1] === 'true' : false;

    if (!forceExponential && value > 1e-3 && value < 1e3) {
      return value.toFixed(precision);
    }

    return value.toExponential(precision);
  }
}
