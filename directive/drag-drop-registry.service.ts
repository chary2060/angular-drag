import { Injectable, NgZone, Inject } from '@angular/core';
import { Subject } from 'rxjs';
import { DOCUMENT } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class DragDropRegistryService<I, C>{
  readonly pointerMove: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();
  readonly pointerUp: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();
  private _activeDragInstances = new Set<I>();
  private _document: Document;
  /** Registered drop container instances. */
  private _dropInstances = new Set<C>();

  /** Registered drag item instances. */
  private _dragInstances = new Set<I>();
  /** Keeps track of the event listeners that we've bound to the `document`. */
  private _globalListeners = new Map<string, {
    handler: (event: Event) => void,
    options?: AddEventListenerOptions | boolean
  }>();
  constructor(private _ngZone: NgZone,
    @Inject(DOCUMENT) _document: any) {
    this._document = document;
  }
  startDragging(drag: I, event: TouchEvent | MouseEvent) {
    this._activeDragInstances.add(drag);

    if (this._activeDragInstances.size === 1) {
      const isTouchEvent = event.type.startsWith('touch');
      const moveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
      const upEvent = isTouchEvent ? 'touchend' : 'mouseup';

      // We explicitly bind __active__ listeners here, because newer browsers will default to
      // passive ones for `mousemove` and `touchmove`. The events need to be active, because we
      // use `preventDefault` to prevent the page from scrolling while the user is dragging.
      this._globalListeners
        .set(moveEvent, {
          handler: (e: Event) => this.pointerMove.next(e as TouchEvent | MouseEvent),
          options: true
        })
        .set(upEvent, {
          handler: (e: Event) => this.pointerUp.next(e as TouchEvent | MouseEvent),
          options: true
        })
        // Preventing the default action on `mousemove` isn't enough to disable text selection
        // on Safari so we need to prevent the selection event as well. Alternatively this can
        // be done by setting `user-select: none` on the `body`, however it has causes a style
        // recalculation which can be expensive on pages with a lot of elements.
        .set('selectstart', {
          handler: this._preventDefaultWhileDragging,
          options: true
        });

      // TODO(crisbeto): prevent mouse wheel scrolling while
      // dragging until we've set up proper scroll handling.
      if (!isTouchEvent) {
        this._globalListeners.set('wheel', {
          handler: this._preventDefaultWhileDragging,
          options: true
        });
      }

      this._ngZone.runOutsideAngular(() => {
        this._globalListeners.forEach((config, name) => {
          this._document.addEventListener(name, config.handler, config.options);
        });
      });
    }
  }
  private _preventDefaultWhileDragging = (event: Event) => {
    if (this._activeDragInstances.size) {
      event.preventDefault();
    }
  }
  /** Gets whether a drag item instance is currently being dragged. */
  isDragging(drag: I) {
    return this._activeDragInstances.has(drag);
  }
  /** Stops dragging a drag item instance. */
  stopDragging(drag: I) {
    this._activeDragInstances.delete(drag);

    if (this._activeDragInstances.size === 0) {
      this._clearGlobalListeners();
    }
  }
  /** Clears out the global event listeners from the `document`. */
  private _clearGlobalListeners() {
    this._globalListeners.forEach((config, name) => {
      this._document.removeEventListener(name, config.handler, config.options);
    });

    this._globalListeners.clear();
  }
  removeDragItem(drag: I) {
    this._dragInstances.delete(drag);
    this.stopDragging(drag);
  }

  /** Adds a drop container to the registry. */
  registerDropContainer(drop: C) {
    if (!this._dropInstances.has(drop)) {
      this._dropInstances.add(drop);
    }
  }
  /** Adds a drag item instance to the registry. */
  registerDragItem(drag: I) {
    this._dragInstances.add(drag);
  }
}
