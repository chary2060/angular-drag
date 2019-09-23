import { ElementRef, NgZone, EmbeddedViewRef } from '@angular/core';
import { ViewportRuler } from '@angular/cdk/overlay';
import { DragDropRegistryService } from './drag-drop-registry.service';
import { DropListRefer } from './drop-list-refer';
import { coerceElement, coerceBooleanProperty } from '@angular/cdk/coercion';
import { Subject, Subscription } from 'rxjs';
import { Point, extendStyles, toggleNativeDragInteractions } from './controls-drop-ref';
import { normalizePassiveListenerOptions } from '@angular/cdk/platform';
const activeEventListenerOptions = normalizePassiveListenerOptions({ passive: false });

export class DragRefer<T = any>  {
  private _rootElement: HTMLElement;
  /** Emits as the drag sequence is being prepared. */
  beforeStarted = new Subject<void>();
  private _pickupPositionInElement: Point;
  /** Subscription to pointer movement events. */
  private _pointerMoveSubscription = Subscription.EMPTY;
  private _pickupPositionOnPage: Point;
  private _dragStartTime: number;
  private _scrollPosition: { top: number, left: number };
  private _pointerPositionAtLastDirectionChange: Point;
  _dropContainer: DropListRefer;
  dragStartDelay: number = 0;
  /** Subscription to the event that is dispatched when the user lifts their pointer. */
  private _pointerUpSubscription = Subscription.EMPTY;
  private _hasStartedDragging: boolean;
  private _nextSibling: Node | null;
  /** Element displayed next to the user's pointer while the element is dragged. */
  private _preview: HTMLElement;
  private _hasMoved: boolean;
  /** Reference to the view of the preview element. */
  private _previewRef: EmbeddedViewRef<any> | null;
  private _initialContainer: DropListRefer;
  prevousIndex: number = -1;
  /** Emits when the user starts dragging the item. */
  started = new Subject<{ source: DragRefer }>();

  /** Emits when the user has released a drag item, before any animations have started. */
  released = new Subject<{ source: DragRefer }>();

  /** Emits when the user stops dragging an item in the container. */
  ended = new Subject<{ source: DragRefer, distance: Point }>();

  /** Emits when the user has moved the item into a new container. */
  entered = new Subject<{ container: DropListRefer, item: DragRefer, currentIndex: number }>();

  /** Emits when the user removes the item its container by dragging it into another container. */
  exited = new Subject<{ container: DropListRefer, item: DragRefer }>();
  /** Emits when the user drops the item inside a container. */
  dropped = new Subject<{
    previousIndex: number;
    currentIndex: number;
  }>();
  private _passiveTransform: Point = { x: 0, y: 0 };
  private _activeTransform: Point = { x: 0, y: 0 };
  private _initialTransform?: string;
  private _placeholder: HTMLElement;
  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    const newValue = coerceBooleanProperty(value);

    if (newValue !== this._disabled) {
      this._disabled = newValue;
    }
  }
  private _disabled = false;
  constructor(
    element: ElementRef<HTMLElement> | HTMLElement,
    private _document: Document,
    private _ngZone: NgZone,
    private _viewportRuler: ViewportRuler,
    private _dragDropRegistry: DragDropRegistryService<DragRefer, DropListRefer>) {
    this.withRootElement(element);
    _dragDropRegistry.registerDragItem(this);
  }
  withRootElement(rootElement: ElementRef<HTMLElement> | HTMLElement): this {
    const element: HTMLElement = coerceElement(rootElement);

    if (element !== this._rootElement) {
      if (this._rootElement) {
        this._removeRootElementListeners(this._rootElement);
      }

      element.addEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
      // element.addEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);
      // this._initialTransform = undefined;
      this._rootElement = element;
    }

    return this;
  }
  /** Removes the manually-added event listeners from the root element. */
  private _removeRootElementListeners(element: HTMLElement) {
    element.removeEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
    // element.removeEventListener('touchstart', this._pointerDown, true);
  }
  /** Handler for the `mousedown`/`touchstart` events. */
  private _pointerDown = (event: MouseEvent) => {
    this.beforeStarted.next();
    if (!this.disabled) {
      this._initializeDragSequence(this._rootElement, event);
    }
  }
  private _initializeDragSequence(referenceElement: HTMLElement, event: MouseEvent) {
    // Always stop propagation for the event that initializes
    // the dragging sequence, in order to prevent it from potentially
    // starting another sequence for a draggable parent somewhere up the DOM tree.
    event.stopPropagation();

    const rootElement = this._rootElement;

    if (event.target && (event.target as HTMLElement).draggable && event.type === 'mousedown') {
      event.preventDefault();
    }

    this._hasStartedDragging = this._hasMoved = false;
    this._initialContainer = this._dropContainer!;

    this._pointerMoveSubscription = this._dragDropRegistry.pointerMove.subscribe(this._pointerMove);
    this._pointerUpSubscription = this._dragDropRegistry.pointerUp.subscribe(this._pointerUp);
    this._scrollPosition = this._viewportRuler.getViewportScrollPosition();

    this._pickupPositionInElement = this._getPointerPositionInElement(referenceElement, event);
    const pointerPosition = this._pickupPositionOnPage = this._getPointerPositionOnPage(event);
    this._pointerPositionAtLastDirectionChange = { x: pointerPosition.x, y: pointerPosition.y };
    this._dragStartTime = Date.now();
    this._dragDropRegistry.startDragging(this, event);
  }
  /** Unsubscribes from the global subscriptions. */
  private _removeSubscriptions() {
    this._pointerMoveSubscription.unsubscribe();
    this._pointerUpSubscription.unsubscribe();
  }
  private _getPointerPositionInElement(referenceElement: HTMLElement,
    event: MouseEvent): Point {
    const elementRect = this._rootElement.getBoundingClientRect();
    const handleElement = referenceElement === this._rootElement ? null : referenceElement;
    const referenceRect = handleElement ? handleElement.getBoundingClientRect() : elementRect;
    const x = event.pageX - referenceRect.left - this._scrollPosition.left;
    const y = event.pageY - referenceRect.top - this._scrollPosition.top;

    return {
      x: referenceRect.left - elementRect.left + x,
      y: referenceRect.top - elementRect.top + y
    };
  }
  /** Determines the point of the page that was touched by the user. */
  private _getPointerPositionOnPage(event: MouseEvent): Point {
    // `touches` will be empty for start/end events so we have to fall back to `changedTouches`.
    const point = event;

    return {
      x: point.pageX - this._scrollPosition.left,
      y: point.pageY - this._scrollPosition.top
    };
  }
  /** Handler that is invoked when the user moves their pointer after they've initiated a drag. */
  private _pointerMove = (event: MouseEvent) => {
    if (!this._hasStartedDragging) {
      if ((Date.now() >= this._dragStartTime + (this.dragStartDelay || 0))) {
        this._hasStartedDragging = true;
        this._ngZone.run(() => this._startDragSequence(event));
      }
      return;
    }

    const constrainedPointerPosition = this._getConstrainedPointerPosition(event);
    this._hasMoved = true;
    event.preventDefault();
    event.stopPropagation();

    if (this._dropContainer) {
      this._updateActiveDropContainer(constrainedPointerPosition);
    } else {
      const activeTransform = this._activeTransform;
      activeTransform.x =
        constrainedPointerPosition.x - this._pickupPositionOnPage.x + this._passiveTransform.x;
      activeTransform.y =
        constrainedPointerPosition.y - this._pickupPositionOnPage.y + this._passiveTransform.y;

      this._applyRootElementTransform(activeTransform.x, activeTransform.y);

      // Apply transform as attribute if dragging and svg element to work for IE
      if (typeof SVGElement !== 'undefined' && this._rootElement instanceof SVGElement) {
        const appliedTransform = `translate(${activeTransform.x} ${activeTransform.y})`;
        this._rootElement.setAttribute('transform', appliedTransform);
      }
    }
  }

  /** Handler that is invoked when the user lifts their pointer up, after initiating a drag. */
  private _pointerUp = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    this._removeSubscriptions();
    this._dragDropRegistry.stopDragging(this);

    if (!this._hasStartedDragging) {
      return;
    }
    this.released.next({ source: this });

    if (!this._dropContainer) {
      // Convert the active transform into a passive one. This means that next time
      // the user starts dragging the item, its position will be calculated relatively
      // to the new passive transform.
      this._passiveTransform.x = this._activeTransform.x;
      this._passiveTransform.y = this._activeTransform.y;
      this._ngZone.run(() => {
        this.ended.next({
          source: this,
          distance: this._getDragDistance(this._getPointerPositionOnPage(event))
        });
      });
      this._dragDropRegistry.stopDragging(this);
      return;
    }
    this._animatePreviewToPlaceholder().then(() => {
      this._cleanupDragArtifacts(event);
      this._dragDropRegistry.stopDragging(this);
    });
  }
  private _getDragDistance(currentPosition: Point): Point {
    const pickupPosition = this._pickupPositionOnPage;

    if (pickupPosition) {
      return { x: currentPosition.x - pickupPosition.x, y: currentPosition.y - pickupPosition.y };
    }

    return { x: 0, y: 0 };
  }
  /** Starts the dragging sequence. */
  private _startDragSequence(event: MouseEvent | TouchEvent) {
    // Emit the event on the item before the one on the container.
    // this.started.next({ source: this });
    if (this._dropContainer) {
      const element = this._rootElement;

      // Grab the `nextSibling` before the preview and placeholder
      // have been created so we don't get the preview by accident.
      this._nextSibling = element.nextSibling;

      const preview = this._preview = this._createPreviewElement();
      // const placeholder = this._placeholder = this._createPlaceholderElement();
      const placeholder = this._placeholder = this._createPlaceholderElement();

      // We move the element out at the end of the body and we make it hidden, because keeping it in
      // place will throw off the consumer's `:last-child` selectors. We can't remove the element
      // from the DOM completely, because iOS will stop firing all subsequent events in the chain.
      // element.style.display = 'none';
      // this._document.body.appendChild(element.parentNode!.replaceChild(placeholder, element));
      preview.style.zIndex = '999999';
      getPreviewInsertionPoint(this._document).appendChild(preview);
      this._dropContainer.start();
      this.prevousIndex = this._dropContainer.getItemIndex(this);
    }
  }
  private _createPlaceholderElement(): HTMLElement {
    let placeholder: HTMLElement;
    placeholder = deepCloneNode(this._rootElement);
    placeholder.classList.add('cdk-drag-placeholder');
    return placeholder;
  }
  /** Destroys the placeholder element and its ViewRef. */
  private _destroyPlaceholder() {
    if (this._placeholder) {
      removeElement(this._placeholder);
    }
    this._placeholder = null!;
  }

  private _applyRootElementTransform(x: number, y: number) {
    const transform = getTransform(x, y);

    // Cache the previous transform amount only after the first drag sequence, because
    // we don't want our own transforms to stack on top of each other.
    if (this._initialTransform == null) {
      this._initialTransform = this._rootElement.style.transform || '';
    }

    // Preserve the previous `transform` value, if there was one. Note that we apply our own
    // transform before the user's, because things like rotation can affect which direction
    // the element will be translated towards.
    this._rootElement.style.transform = this._initialTransform ?
      transform + ' ' + this._initialTransform : transform;
  }
  /** Destroys the preview element and its ViewRef. */
  private _destroyPreview() {
    if (this._preview) {
      removeElement(this._preview);
    }
    if (this._dropContainer.cloneElement) {
      removeElement(this._dropContainer.cloneElement);
      this._dropContainer.cloneElement = null;
      (<HTMLElement>this._dropContainer.element).style.visibility = 'visible';
    }
    if (this._previewRef) {
      this._previewRef.destroy();
    }

    this._preview = this._previewRef = null!;
  }
  private _createPreviewElement(): HTMLElement {
    let preview: HTMLElement;

    const element = this._rootElement;
    const elementRect = element.getBoundingClientRect();

    preview = deepCloneNode(element);
    preview.style.width = `${elementRect.width}px`;
    preview.style.height = `${elementRect.height}px`;
    preview.style.transform = getTransform(elementRect.left, elementRect.top);

    extendStyles(preview.style, {
      // It's important that we disable the pointer events on the preview, because
      // it can throw off the `document.elementFromPoint` calls in the `CdkDropList`.
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '1000'
    });

    toggleNativeDragInteractions(preview, false);

    preview.classList.add('cdk-drag-preview');
    return preview;
  }
  private _getConstrainedPointerPosition(event: MouseEvent): Point {
    const point = this._getPointerPositionOnPage(event);
    const constrainedPoint = point;
    return constrainedPoint;
  }
  private _updateActiveDropContainer({ x, y }: Point) {
    // Drop container that draggable has been moved into.
    let newContainer = this._initialContainer._getSiblingContainerFromPosition(this, x, y);

    // If we couldn't find a new container to move the item into, and the item has left it's
    // initial container, check whether the it's over the initial container. This handles the
    // case where two containers are connected one way and the user tries to undo dragging an
    // item into a new container.
    if (!newContainer && this._dropContainer !== this._initialContainer &&
      this._initialContainer._isOverContainer(x, y)) {
      newContainer = this._initialContainer;
    }

    if (newContainer && newContainer !== this._dropContainer) {
      this._ngZone.run(() => {
        // Notify the old container that the item has left.
        this.exited.next({ item: this, container: this._dropContainer! });
        // Notify the new container that the item has entered.
        this._dropContainer = newContainer!;
        this.entered.next({
          item: this,
          container: newContainer!,
          currentIndex: 1
        });
      });
    }

    this._dropContainer!._sortItem(this, x, y);
    this._preview.style.transform =
      getTransform(x - this._pickupPositionInElement.x, y - this._pickupPositionInElement.y);
  }
  getPlaceholderElement(): HTMLElement {
    return this._placeholder;
  }

  /** Returns the root draggable element. */
  getRootElement(): HTMLElement {
    return this._rootElement;
  }

  isDragging(): boolean {
    return this._hasStartedDragging && this._dragDropRegistry.isDragging(this);
  }
  private _animatePreviewToPlaceholder(): Promise<void> {
    // If the user hasn't moved yet, the transitionend event won't fire.
    if (!this._hasMoved) {
      return Promise.resolve();
    }

    const placeholderRect = this._placeholder.getBoundingClientRect();

    // Apply the class that adds a transition to the preview.
    this._preview.classList.add('cdk-drag-animating');

    // Move the preview to the placeholder position.
    this._preview.style.transform = getTransform(placeholderRect.left, placeholderRect.top);

    // If the element doesn't have a `transition`, the `transitionend` event won't fire. Since
    // we need to trigger a style recalculation in order for the `cdk-drag-animating` class to
    // apply its style, we take advantage of the available info to figure out whether we need to
    // bind the event in the first place.
    const duration = getTransformTransitionDurationInMs(this._preview);

    if (duration === 0) {
      return Promise.resolve();
    }

    return this._ngZone.runOutsideAngular(() => {
      return new Promise(resolve => {
        const handler = ((event: TransitionEvent) => {
          if (!event || (event.target === this._preview && event.propertyName === 'transform')) {
            this._preview.removeEventListener('transitionend', handler);
            resolve();
            clearTimeout(timeout);
          }
        }) as EventListenerOrEventListenerObject;

        // If a transition is short enough, the browser might not fire the `transitionend` event.
        // Since we know how long it's supposed to take, add a timeout with a 50% buffer that'll
        // fire if the transition hasn't completed when it was supposed to.
        const timeout = setTimeout(handler as Function, duration * 1.5);
        this._preview.addEventListener('transitionend', handler);
      });
    });
  }
  private _cleanupDragArtifacts(event: MouseEvent) {
    // Restore the element's visibility and insert it at its old position in the DOM.
    // It's important that we maintain the position, because moving the element around in the DOM
    // can throw off `NgFor` which does smart diffing and re-creates elements only when necessary,
    // while moving the existing elements in all other cases.
    this._rootElement.style.display = '';

    // if (this._nextSibling) {
    //   this._nextSibling.parentNode!.insertBefore(this._rootElement, this._nextSibling);
    // } else {
    //   coerceElement(this._initialContainer.element).appendChild(this._rootElement);
    // }

    this._destroyPreview();
    this._destroyPlaceholder();

    // Re-enter the NgZone since we bound `document` events on the outside.
    this._ngZone.run(() => {
      const container = this._dropContainer!;
      const currentIndex = container.getItemIndex(this);
      const previousIndex = this._initialContainer.getItemIndex(this);
      this.dropped.next({
        currentIndex,
        previousIndex: previousIndex,
      });
      container.drop(this, currentIndex, this._initialContainer, this.prevousIndex);
      this._dropContainer = this._initialContainer;
    });
  }
  dispose() {
    this._removeRootElementListeners(this._rootElement);

    // Do this check before removing from the registry since it'll
    // stop being considered as dragged once it is removed.
    if (this.isDragging()) {
      // Since we move out the element to the end of the body while it's being
      // dragged, we have to make sure that it's removed if it gets destroyed.
      removeElement(this._rootElement);
    }

    this._destroyPreview();
    this._destroyPlaceholder();
    this._dragDropRegistry.removeDragItem(this);
    this._removeSubscriptions();
    this.beforeStarted.complete();
    this.started.complete();
    this.released.complete();
    this.ended.complete();
    this.entered.complete();
    this.exited.complete();
    this.dropped.complete();
    this._dropContainer = undefined;
    this._nextSibling = null!;
  }
}
export function getTransformTransitionDurationInMs(element: HTMLElement): number {
  const computedStyle = getComputedStyle(element);
  const transitionedProperties = parseCssPropertyValue(computedStyle, 'transition-property');
  const property = transitionedProperties.find(prop => prop === 'transform' || prop === 'all');

  // If there's no transition for `all` or `transform`, we shouldn't do anything.
  if (!property) {
    return 0;
  }

  // Get the index of the property that we're interested in and match
  // it up to the same index in `transition-delay` and `transition-duration`.
  const propertyIndex = transitionedProperties.indexOf(property);
  const rawDurations = parseCssPropertyValue(computedStyle, 'transition-duration');
  const rawDelays = parseCssPropertyValue(computedStyle, 'transition-delay');

  return parseCssTimeUnitsToMs(rawDurations[propertyIndex]) +
    parseCssTimeUnitsToMs(rawDelays[propertyIndex]);
}
function parseCssTimeUnitsToMs(value: string): number {
  // Some browsers will return it in seconds, whereas others will return milliseconds.
  const multiplier = value.toLowerCase().indexOf('ms') > -1 ? 1 : 1000;
  return parseFloat(value) * multiplier;
}
function parseCssPropertyValue(computedStyle: CSSStyleDeclaration, name: string): string[] {
  const value = computedStyle.getPropertyValue(name);
  return value.split(',').map(part => part.trim());
}

function removeElement(element: HTMLElement | null) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}
export function getTransform(x: number, y: number): string {
  // Round the transforms since some browsers will
  // blur the elements for sub-pixel transforms.
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}
/** Creates a deep clone of an element. */
export function deepCloneNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  const descendantsWithId = clone.querySelectorAll('[id]');
  const descendantCanvases = node.querySelectorAll('canvas');

  // Remove the `id` to avoid having multiple elements with the same id on the page.
  clone.removeAttribute('id');

  for (let i = 0; i < descendantsWithId.length; i++) {
    descendantsWithId[i].removeAttribute('id');
  }

  // `cloneNode` won't transfer the content of `canvas` elements so we have to do it ourselves.
  // We match up the cloned canvas to their sources using their index in the DOM.
  if (descendantCanvases.length) {
    const cloneCanvases = clone.querySelectorAll('canvas');

    for (let i = 0; i < descendantCanvases.length; i++) {
      const correspondingCloneContext = cloneCanvases[i].getContext('2d');

      if (correspondingCloneContext) {
        correspondingCloneContext.drawImage(descendantCanvases[i], 0, 0);
      }
    }
  }

  return clone;
}
export function getPreviewInsertionPoint(documentRef: any): HTMLElement {
  // We can't use the body if the user is in fullscreen mode,
  // because the preview will render under the fullscreen element.
  // TODO(crisbeto): dedupe this with the `FullscreenOverlayContainer` eventually.
  return documentRef.fullscreenElement ||
    documentRef.webkitFullscreenElement ||
    documentRef.mozFullScreenElement ||
    documentRef.msFullscreenElement ||
    documentRef.body;
}
