import { Directive, ElementRef, Inject, Optional, SkipSelf, NgZone, ChangeDetectorRef, OnDestroy, Input } from '@angular/core';
import { App_DropElement } from './controls-drop-ref';
import { DropElementDirective } from './drop-element.directive';
import { DOCUMENT } from '@angular/platform-browser';
import { DragDropService } from './drag-drop.service';
import { DragRefer } from './drag-refer';
import { coerceBooleanProperty } from '@angular/cdk/coercion';

@Directive({
  selector: '[appDragElement]'
})
export class DragElementDirective<T = any>  {
  _dragRef: DragRefer<DragElementDirective<T>>;
  @Input('dragDisabled')
  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
    this._dragRef.disabled = this._disabled;
  }
  private _disabled = false;
  constructor(public element: ElementRef<HTMLElement>,
    /** Droppable container that the draggable is a part of. */
    @Optional() @SkipSelf() public dropContainer: DropElementDirective,
    @Inject(DOCUMENT) private _document: any, private _ngZone: NgZone, dragDrop: DragDropService,
    private _changeDetectorRef: ChangeDetectorRef) {
    this._dragRef = dragDrop.createDrag(element);
    this._dragRef._dropContainer = this.dropContainer!._dropListRef;
    this._dragRef._dropContainer!._draggables.push(this._dragRef);
  }
  ngOnDestroy() {
    const index = this._dragRef._dropContainer!._draggables.indexOf(this._dragRef);
    if (index > -1) {
      this._dragRef._dropContainer!._draggables.splice(index, 1);
    }
    this._dragRef.dispose();
  }
  private _syncInputs(ref: DragRefer<DragElementDirective<T>>) {
    ref.beforeStarted.subscribe(() => {
      if (!ref.isDragging()) {
        ref.disabled = this.disabled;
      }
    });
  }
}
