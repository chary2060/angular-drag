import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragElementDirective } from './directive/drag-element.directive';
import { DropElementDirective } from './directive/drop-element.directive';
import { DropElementGroupDirective } from './directive/drop-element-group.directive';
@NgModule({
  declarations: [DragElementDirective, DropElementDirective, DropElementGroupDirective],
  imports: [
    CommonModule
  ],
  exports: [DragElementDirective, DropElementDirective, DropElementGroupDirective]
})
export class DragElementModule { }
