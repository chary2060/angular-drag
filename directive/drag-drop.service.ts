import { Injectable, Inject, NgZone, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { ViewportRuler } from '@angular/cdk/overlay';
import { DragDropRegistryService } from './drag-drop-registry.service';
import { DragRefer } from './drag-refer';
import { DropListRefer } from './drop-list-refer';

@Injectable({
  providedIn: 'root'
})
export class DragDropService {

  constructor(
    @Inject(DOCUMENT) private _document: any,
    private _ngZone: NgZone,
    private _viewportRuler: ViewportRuler,
    private _dragDropRegistry: DragDropRegistryService<DragRefer, DropListRefer>) {}

  /**
   * Turns an element into a draggable item.
   * @param element Element to which to attach the dragging functionality.
   * @param config Object used to configure the dragging behavior.
   */
  createDrag<T = any>(element: ElementRef<HTMLElement> | HTMLElement): DragRefer<T> {

    return new DragRefer<T>(element,this._document, this._ngZone, this._viewportRuler,
        this._dragDropRegistry);
  }

  /**
   * Turns an element into a drop list.
   * @param element Element to which to attach the drop list functionality.
   */
  createDropList<T = any>(element: ElementRef<HTMLElement> | HTMLElement): DropListRefer<T> {
    return new DropListRefer<T>(element, this._dragDropRegistry, this._document);
  }
}
