import { Directive, ElementRef, ChangeDetectorRef, Optional, SkipSelf, Output, EventEmitter, OnDestroy } from '@angular/core';
import { DropListRefer } from './drop-list-refer';
import { DragDropService } from './drag-drop.service';
import { DragRefer } from './drag-refer';
import { DragElementDirective } from './drag-element.directive';

@Directive({
  selector: '[appDropElement]'
})
export class DropElementDirective<T = any>  {
  @Output('appDropListDropped')
  dropped: EventEmitter<any> = new EventEmitter<any>();
  _dropListRef: DropListRefer<DropElementDirective<T>>;
  constructor(
    /** Element that the drop list is attached to. */
    public element: ElementRef<HTMLElement>, dragDrop: DragDropService,
    private _changeDetectorRef: ChangeDetectorRef) {
    this._dropListRef = dragDrop.createDropList(element);
    this._handleEvents(this._dropListRef);
  }
  private _handleEvents(ref: DropListRefer<DropElementDirective>) {
    ref.beforeStarted.subscribe(() => {
      this._changeDetectorRef.markForCheck();
    });
    ref.dropped.subscribe(event => {
      this.dropped.emit({
        previousIndex: event.previousIndex,
        currentIndex: event.currentIndex,
      });
      this._changeDetectorRef.markForCheck();
    });
  }
  ngOnDestroy() {
  }
}
