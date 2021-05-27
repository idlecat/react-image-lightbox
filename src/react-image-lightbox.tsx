import React, { Component, createRef, ReactNode } from 'react';
import Modal from 'react-modal';
import {
  getWindowWidth,
  getWindowHeight,
  getHighestSafeWindowContext,
} from './util';
import {
  KEYS,
  MIN_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  ZOOM_RATIO,
  WHEEL_MOVE_X_THRESHOLD,
  WHEEL_MOVE_Y_THRESHOLD,
  ZOOM_BUTTON_INCREMENT_SIZE,
  Action,
  Source,
  MIN_SWIPE_DISTANCE,
} from './constant';
import './style.css';
import { Callback, StringMap } from './baseTypes';

interface Props {
  //-----------------------------
  // Image sources
  //-----------------------------

  // Main display image url
  mainSrc: string;

  // Previous display image url (displayed to the left)
  // If left undefined, movePrev actions will not be performed, and the button not displayed
  prevSrc?: string;

  // Next display image url (displayed to the right)
  // If left undefined, moveNext actions will not be performed, and the button not displayed
  nextSrc?: string;

  //-----------------------------
  // Image thumbnail sources
  //-----------------------------

  // Thumbnail image url corresponding to props.mainSrc
  mainSrcThumbnail?: string;

  // Thumbnail image url corresponding to props.prevSrc
  prevSrcThumbnail?: string;

  // Thumbnail image url corresponding to props.nextSrc
  nextSrcThumbnail?: string;

  //-----------------------------
  // Event Handlers
  //-----------------------------

  // Close window event
  // Should change the parent state such that the lightbox is not rendered
  onCloseRequest: Callback<void>;

  // Move to previous image event
  // Should change the parent state such that props.prevSrc becomes props.mainSrc,
  //  props.mainSrc becomes props.nextSrc, etc.
  onMovePrevRequest: Callback<void>;

  // Move to next image event
  // Should change the parent state such that props.nextSrc becomes props.mainSrc,
  //  props.mainSrc becomes props.prevSrc, etc.
  onMoveNextRequest: Callback<void>;

  // Called when an image fails to load
  onImageLoadError: (
    imageSrc: string,
    srcType: string,
    errorEvent: any
  ) => void;

  // Called when image successfully loads
  onImageLoad: (imageSrc: string, srcType: string, img: any) => void;

  // Open window event
  onAfterOpen: Callback<void>;

  //-----------------------------
  // Download discouragement settings
  //-----------------------------

  // Enable download discouragement (prevents [right-click -> Save Image As...])
  discourageDownloads?: boolean;

  //-----------------------------
  // Animation settings
  //-----------------------------

  // Disable all animation
  animationDisabled?: boolean;

  // Disable animation on actions performed with keyboard shortcuts
  animationOnKeyInput?: boolean;

  // Animation duration (ms)
  animationDuration?: number;

  //-----------------------------
  // Keyboard shortcut settings
  //-----------------------------

  // Required interval of time (ms) between key actions
  // (prevents excessively fast navigation of images)
  keyRepeatLimit: number;

  // Amount of time (ms) restored after each keyup
  // (makes rapid key presses slightly faster than holding down the key to navigate images)
  keyRepeatKeyupBonus: number;

  //-----------------------------
  // Image info
  //-----------------------------

  // Image title
  imageTitle?: ReactNode;

  // Image caption
  imageCaption?: ReactNode;

  // Optional crossOrigin attribute
  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';

  //-----------------------------
  // Lightbox style
  //-----------------------------

  // Padding (px) between the edge of the window and the lightbox
  imagePadding: number;

  wrapperClassName?: string;

  //-----------------------------
  // Other
  //-----------------------------

  // Array of custom toolbar buttons
  toolbarButtons?: ReactNode[];

  // When true, clicks outside of the image close the lightbox
  clickOutsideToClose?: boolean;

  // Set to false to disable zoom functionality and hide zoom buttons
  enableZoom?: boolean;

  // Aria-labels
  nextLabel?: string;
  prevLabel?: string;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  closeLabel?: string;

  imageLoadErrorMessage?: ReactNode;
}

interface State {
  //-----------------------------
  // Animation
  //-----------------------------

  // Lightbox is closing
  // When Lightbox is mounted, if animation is enabled it will open with the reverse of the closing animation
  isClosing?: boolean;

  // Component parts should animate (e.g., when images are moving, or image is being zoomed)
  shouldAnimate?: boolean;

  //-----------------------------
  // Zoom settings
  //-----------------------------
  // Zoom level of image
  zoomLevel: number;

  //-----------------------------
  // Image position settings
  //-----------------------------
  // Horizontal offset from center
  offsetX: number;

  // Vertical offset from center
  offsetY: number;

  // image load error for srcType
  loadErrorStatus: StringMap<string | boolean>;
}

const DefaultProps: Partial<Props> = {
  animationDisabled: false,
  animationDuration: 300,
  animationOnKeyInput: false,
  clickOutsideToClose: true,
  closeLabel: 'Close lightbox',
  discourageDownloads: false,
  enableZoom: true,
  imagePadding: 10,
  keyRepeatKeyupBonus: 40,
  keyRepeatLimit: 180,
  nextLabel: 'Next image',
  onAfterOpen: () => {},
  onImageLoadError: () => {},
  onImageLoad: () => {},
  onMoveNextRequest: () => {},
  onMovePrevRequest: () => {},
  prevLabel: 'Previous image',
  wrapperClassName: '',
  zoomInLabel: 'Zoom in',
  zoomOutLabel: 'Zoom out',
  imageLoadErrorMessage: 'This image failed to load',
};

interface ParsedEvent {
  id: any;
  source?: Source;
  x: number;
  y: number;
}

class ReactImageLightbox extends Component<Props, State> {
  static defaultProps = DefaultProps;
  static isTargetMatchImage(target) {
    return target && /ril-image-current/.test(target.className);
  }

  static parseMouseEvent(mouseEvent): ParsedEvent {
    return {
      id: 'mouse',
      source: Source.MOUSE,
      x: parseInt(mouseEvent.clientX, 10),
      y: parseInt(mouseEvent.clientY, 10),
    };
  }

  static parseTouchPointer(touchPointer): ParsedEvent {
    return {
      id: touchPointer.identifier,
      source: Source.TOUCH,
      x: parseInt(touchPointer.clientX, 10),
      y: parseInt(touchPointer.clientY, 10),
    };
  }

  static parsePointerEvent(pointerEvent): ParsedEvent {
    return {
      id: pointerEvent.pointerId,
      source: Source.POINTER,
      x: parseInt(pointerEvent.clientX, 10),
      y: parseInt(pointerEvent.clientY, 10),
    };
  }

  // Request to transition to the previous image
  static getTransform({ x = 0, y = 0, zoom = 1, width, targetWidth }) {
    let nextX = x;
    const windowWidth = getWindowWidth();
    if (width > windowWidth) {
      nextX += (windowWidth - width) / 2;
    }
    const scaleFactor = zoom * (targetWidth / width);

    return {
      transform: `translate3d(${nextX}px,${y}px,0) scale3d(${scaleFactor},${scaleFactor},1)`,
    };
  }

  outerEl = createRef<HTMLDivElement>();
  zoomInBtn = createRef<HTMLButtonElement>();
  zoomOutBtn = createRef<HTMLButtonElement>();
  caption = createRef<HTMLDivElement>();
  timeouts: number[] = [];
  currentAction = Action.NONE;
  eventsSource = Source.ANY;
  pointerList: ParsedEvent[] = [];
  preventInnerClose = false;
  preventInnerCloseTimeout?: number;
  keyPressed = false;
  imageCache = {};
  lastKeyDownTime = 0;
  resizeTimeout?: number;
  wheelActionTimeout?: number;
  resetScrollTimeout?: number;
  scrollX = 0;
  scrollY = 0;
  moveStartX = 0;
  moveStartY = 0;
  moveStartOffsetX = 0;
  moveStartOffsetY = 0;
  swipeStartX = 0;
  swipeStartY = 0;
  swipeEndX = 0;
  swipeEndY = 0;
  pinchTouchList: ParsedEvent[] = [];
  pinchDistance = 0;
  keyCounter = 0;
  moveRequested = false;
  windowContext?: Window;
  didUnmount = false;

  handleWindowResize = () => {
    this.clearTimeout(this.resizeTimeout);
    this.resizeTimeout = this.setTimeout(this.forceUpdate.bind(this), 100);
  };
  handleMouseUp = event => {
    if (this.shouldHandleEvent(Source.MOUSE)) {
      this.removePointer(ReactImageLightbox.parseMouseEvent(event));
      this.multiPointerEnd(event);
    }
  };
  handleTouchEnd = event => {
    if (this.shouldHandleEvent(Source.TOUCH)) {
      [].map.call(event.changedTouches, touch =>
        this.removePointer(ReactImageLightbox.parseTouchPointer(touch))
      );
      this.multiPointerEnd(event);
    }
  };

  handlePointerEvent = event => {
    if (this.shouldHandleEvent(Source.POINTER)) {
      switch (event.type) {
        case 'pointerdown':
          if (ReactImageLightbox.isTargetMatchImage(event.target)) {
            this.addPointer(ReactImageLightbox.parsePointerEvent(event));
            this.multiPointerStart(event);
          }
          break;
        case 'pointermove':
          this.multiPointerMove(event, [
            ReactImageLightbox.parsePointerEvent(event),
          ]);
          break;
        case 'pointerup':
        case 'pointercancel':
          this.removePointer(ReactImageLightbox.parsePointerEvent(event));
          this.multiPointerEnd(event);
          break;
        default:
          break;
      }
    }
  };

  listeners = {
    resize: this.handleWindowResize,
    mouseup: this.handleMouseUp,
    touchend: this.handleTouchEnd,
    touchcancel: this.handleTouchEnd,
    pointerdown: this.handlePointerEvent,
    pointermove: this.handlePointerEvent,
    pointerup: this.handlePointerEvent,
    pointercancel: this.handlePointerEvent,
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      isClosing: !props.animationDisabled,
      shouldAnimate: false,
      zoomLevel: MIN_ZOOM_LEVEL,
      offsetX: 0,
      offsetY: 0,
      loadErrorStatus: {},
    };
  }

  componentDidMount() {
    if (!this.props.animationDisabled) {
      // Make opening animation play
      this.setState({ isClosing: false });
    }
    // Prevents cross-origin errors when using a cross-origin iframe
    this.windowContext = getHighestSafeWindowContext();

    Object.keys(this.listeners).forEach(type => {
      this.windowContext!.addEventListener(type, this.listeners[type]);
    });

    this.loadAllImages();
  }

  // eslint-disable-next-line camelcase
  UNSAFE_componentWillReceiveProps(nextProps) {
    // Iterate through the source types for prevProps and nextProps to
    //  determine if any of the sources changed
    let sourcesChanged = false;
    const prevSrcDict = {};
    const nextSrcDict = {};
    this.getSrcTypes().forEach(srcType => {
      if (this.props[srcType.name] !== nextProps[srcType.name]) {
        sourcesChanged = true;

        prevSrcDict[this.props[srcType.name]] = true;
        nextSrcDict[nextProps[srcType.name]] = true;
      }
    });

    if (sourcesChanged || this.moveRequested) {
      // Reset the loaded state for images not rendered next
      Object.keys(prevSrcDict).forEach(prevSrc => {
        if (!(prevSrc in nextSrcDict) && prevSrc in this.imageCache) {
          this.imageCache[prevSrc].loaded = false;
        }
      });

      this.moveRequested = false;

      // Load any new images
      this.loadAllImages(nextProps);
    }
  }

  shouldComponentUpdate() {
    // Wait for move...
    return !this.moveRequested;
  }

  componentWillUnmount() {
    this.didUnmount = true;
    Object.keys(this.listeners).forEach(type => {
      this.windowContext?.removeEventListener(type, this.listeners[type]);
    });
    this.timeouts.forEach(tid => clearTimeout(tid));
  }

  setTimeout(func, time): number {
    const id = (setTimeout(() => {
      this.timeouts = this.timeouts.filter(tid => tid !== id);
      func();
    }, time) as unknown) as number;
    this.timeouts.push(id);
    return id;
  }

  setPreventInnerClose() {
    if (this.preventInnerCloseTimeout) {
      this.clearTimeout(this.preventInnerCloseTimeout);
    }
    this.preventInnerClose = true;
    this.preventInnerCloseTimeout = this.setTimeout(() => {
      this.preventInnerClose = false;
      this.preventInnerCloseTimeout = undefined;
    }, 100);
  }

  // Get info for the best suited image to display with the given srcType
  getBestImageForType(srcType) {
    let imageSrc = this.props[srcType];
    let fitSizes = {
      width: 0,
      height: 0,
    };

    if (this.isImageLoaded(imageSrc)) {
      // Use full-size image if available
      fitSizes = this.getFitSizes(
        this.imageCache[imageSrc].width,
        this.imageCache[imageSrc].height
      );
    } else if (this.isImageLoaded(this.props[`${srcType}Thumbnail`])) {
      // Fall back to using thumbnail if the image has not been loaded
      imageSrc = this.props[`${srcType}Thumbnail`];
      fitSizes = this.getFitSizes(
        this.imageCache[imageSrc].width,
        this.imageCache[imageSrc].height,
        true
      );
    } else {
      return null;
    }

    return {
      src: imageSrc,
      height: this.imageCache[imageSrc].height,
      width: this.imageCache[imageSrc].width,
      targetHeight: fitSizes.height,
      targetWidth: fitSizes.width,
    };
  }

  // Get sizing for when an image is larger than the window
  getFitSizes(
    width: number,
    height: number,
    stretch: boolean = false
  ): {
    width: number;
    height: number;
  } {
    const boxSize = this.getLightboxRect();
    let maxHeight = boxSize.height - this.props.imagePadding * 2;
    let maxWidth = boxSize.width - this.props.imagePadding * 2;

    if (!stretch) {
      maxHeight = Math.min(maxHeight, height);
      maxWidth = Math.min(maxWidth, width);
    }

    const maxRatio = maxWidth / maxHeight;
    const srcRatio = width / height;

    if (maxRatio > srcRatio) {
      // height is the constraining dimension of the photo
      return {
        width: (width * maxHeight) / height,
        height: maxHeight,
      };
    }

    return {
      width: maxWidth,
      height: (height * maxWidth) / width,
    };
  }

  getMaxOffsets() {
    const zoomLevel = this.state.zoomLevel;
    const currentImageInfo = this.getBestImageForType('mainSrc');
    if (currentImageInfo === null) {
      return { maxX: 0, minX: 0, maxY: 0, minY: 0 };
    }

    const boxSize = this.getLightboxRect();
    const zoomMultiplier = this.getZoomMultiplier(zoomLevel);

    let maxX = 0;
    if (zoomMultiplier * currentImageInfo.width - boxSize.width < 0) {
      // if there is still blank space in the X dimension, don't limit except to the opposite edge
      maxX = (boxSize.width - zoomMultiplier * currentImageInfo.width) / 2;
    } else {
      maxX = (zoomMultiplier * currentImageInfo.width - boxSize.width) / 2;
    }

    let maxY = 0;
    if (zoomMultiplier * currentImageInfo.height - boxSize.height < 0) {
      // if there is still blank space in the Y dimension, don't limit except to the opposite edge
      maxY = (boxSize.height - zoomMultiplier * currentImageInfo.height) / 2;
    } else {
      maxY = (zoomMultiplier * currentImageInfo.height - boxSize.height) / 2;
    }

    return {
      maxX,
      maxY,
      minX: -1 * maxX,
      minY: -1 * maxY,
    };
  }

  // Get image src types
  getSrcTypes() {
    return [
      {
        name: 'mainSrc',
        keyEnding: `i${this.keyCounter}`,
      },
      {
        name: 'mainSrcThumbnail',
        keyEnding: `t${this.keyCounter}`,
      },
      {
        name: 'nextSrc',
        keyEnding: `i${this.keyCounter + 1}`,
      },
      {
        name: 'nextSrcThumbnail',
        keyEnding: `t${this.keyCounter + 1}`,
      },
      {
        name: 'prevSrc',
        keyEnding: `i${this.keyCounter - 1}`,
      },
      {
        name: 'prevSrcThumbnail',
        keyEnding: `t${this.keyCounter - 1}`,
      },
    ];
  }

  /**
   * Get sizing when the image is scaled
   */
  getZoomMultiplier(zoomLevel = this.state.zoomLevel) {
    return ZOOM_RATIO ** zoomLevel;
  }

  /**
   * Get the size of the lightbox in pixels
   */
  getLightboxRect() {
    if (this.outerEl.current) {
      return this.outerEl.current.getBoundingClientRect();
    }

    return {
      width: getWindowWidth(),
      height: getWindowHeight(),
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
  }

  clearTimeout(id) {
    this.timeouts = this.timeouts.filter(tid => tid !== id);
    clearTimeout(id);
  }

  // Change zoom level
  changeZoom(
    zoomLevel: number,
    clientX: number | undefined = undefined,
    clientY: number | undefined = undefined
  ) {
    // Ignore if zoom disabled
    if (!this.props.enableZoom) {
      return;
    }

    // Constrain zoom level to the set bounds
    const nextZoomLevel = Math.max(
      MIN_ZOOM_LEVEL,
      Math.min(MAX_ZOOM_LEVEL, zoomLevel)
    );

    // Ignore requests that don't change the zoom level
    if (nextZoomLevel === this.state.zoomLevel) {
      return;
    }

    if (nextZoomLevel === MIN_ZOOM_LEVEL) {
      // Snap back to center if zoomed all the way out
      this.setState({
        zoomLevel: nextZoomLevel,
        offsetX: 0,
        offsetY: 0,
      });

      return;
    }

    const imageBaseSize = this.getBestImageForType('mainSrc');
    if (imageBaseSize === null) {
      return;
    }

    const currentZoomMultiplier = this.getZoomMultiplier();
    const nextZoomMultiplier = this.getZoomMultiplier(nextZoomLevel);

    // Default to the center of the image to zoom when no mouse position specified
    const boxRect = this.getLightboxRect();
    const pointerX =
      typeof clientX !== 'undefined'
        ? clientX - boxRect.left
        : boxRect.width / 2;
    const pointerY =
      typeof clientY !== 'undefined'
        ? clientY - boxRect.top
        : boxRect.height / 2;

    const currentImageOffsetX =
      (boxRect.width - imageBaseSize.width * currentZoomMultiplier) / 2;
    const currentImageOffsetY =
      (boxRect.height - imageBaseSize.height * currentZoomMultiplier) / 2;

    const currentImageRealOffsetX = currentImageOffsetX - this.state.offsetX;
    const currentImageRealOffsetY = currentImageOffsetY - this.state.offsetY;

    const currentPointerXRelativeToImage =
      (pointerX - currentImageRealOffsetX) / currentZoomMultiplier;
    const currentPointerYRelativeToImage =
      (pointerY - currentImageRealOffsetY) / currentZoomMultiplier;

    const nextImageRealOffsetX =
      pointerX - currentPointerXRelativeToImage * nextZoomMultiplier;
    const nextImageRealOffsetY =
      pointerY - currentPointerYRelativeToImage * nextZoomMultiplier;

    const nextImageOffsetX =
      (boxRect.width - imageBaseSize.width * nextZoomMultiplier) / 2;
    const nextImageOffsetY =
      (boxRect.height - imageBaseSize.height * nextZoomMultiplier) / 2;

    let nextOffsetX = nextImageOffsetX - nextImageRealOffsetX;
    let nextOffsetY = nextImageOffsetY - nextImageRealOffsetY;

    // When zooming out, limit the offset so things don't get left askew
    if (this.currentAction !== Action.PINCH) {
      const maxOffsets = this.getMaxOffsets();
      if (this.state.zoomLevel > nextZoomLevel) {
        nextOffsetX = Math.max(
          maxOffsets.minX,
          Math.min(maxOffsets.maxX, nextOffsetX)
        );
        nextOffsetY = Math.max(
          maxOffsets.minY,
          Math.min(maxOffsets.maxY, nextOffsetY)
        );
      }
    }

    this.setState({
      zoomLevel: nextZoomLevel,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  }

  closeIfClickInner = event => {
    if (
      !this.preventInnerClose &&
      event.target.className.search(/\bril-inner\b/) > -1
    ) {
      this.requestClose(event);
    }
  };

  handleKeyInput = event => {
    event.stopPropagation();

    // Ignore key input during animations
    if (this.isAnimating()) {
      return;
    }

    // Allow slightly faster navigation through the images when user presses keys repeatedly
    if (event.type === 'keyup') {
      this.lastKeyDownTime -= this.props.keyRepeatKeyupBonus;
      return;
    }

    const keyCode = event.which || event.keyCode;

    // Ignore key presses that happen too close to each other (when rapid fire key pressing or holding down the key)
    // But allow it if it's a lightbox closing action
    const currentTime = new Date();
    if (
      currentTime.getTime() - this.lastKeyDownTime <
        this.props.keyRepeatLimit &&
      keyCode !== KEYS.ESC
    ) {
      return;
    }
    this.lastKeyDownTime = currentTime.getTime();

    switch (keyCode) {
      // ESC key closes the lightbox
      case KEYS.ESC:
        event.preventDefault();
        this.requestClose(event);
        break;

      // Left arrow key moves to previous image
      case KEYS.LEFT_ARROW:
        if (!this.props.prevSrc) {
          return;
        }

        event.preventDefault();
        this.keyPressed = true;
        this.requestMovePrev();
        break;

      // Right arrow key moves to next image
      case KEYS.RIGHT_ARROW:
        if (!this.props.nextSrc) {
          return;
        }

        event.preventDefault();
        this.keyPressed = true;
        this.requestMoveNext();
        break;

      default:
    }
  };

  /**
   * Handle a mouse wheel event over the lightbox container
   */
  handleOuterMousewheel = event => {
    // Prevent scrolling of the background
    event.stopPropagation();

    const xThreshold = WHEEL_MOVE_X_THRESHOLD;
    let actionDelay = 0;
    const imageMoveDelay = 500;

    this.clearTimeout(this.resetScrollTimeout);
    this.resetScrollTimeout = this.setTimeout(() => {
      this.scrollX = 0;
      this.scrollY = 0;
    }, 300);

    // Prevent rapid-fire zoom behavior
    if (this.wheelActionTimeout !== null || this.isAnimating()) {
      return;
    }

    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
      // handle horizontal scrolls with image moves
      this.scrollY = 0;
      this.scrollX += event.deltaX;

      const bigLeapX = xThreshold / 2;
      // If the scroll amount has accumulated sufficiently, or a large leap was taken
      if (this.scrollX >= xThreshold || event.deltaX >= bigLeapX) {
        // Scroll right moves to next
        this.requestMoveNext();
        actionDelay = imageMoveDelay;
        this.scrollX = 0;
      } else if (
        this.scrollX <= -1 * xThreshold ||
        event.deltaX <= -1 * bigLeapX
      ) {
        // Scroll left moves to previous
        this.requestMovePrev();
        actionDelay = imageMoveDelay;
        this.scrollX = 0;
      }
    }

    // Allow successive actions after the set delay
    if (actionDelay !== 0) {
      this.wheelActionTimeout = this.setTimeout(() => {
        this.wheelActionTimeout = undefined;
      }, actionDelay);
    }
  };

  handleImageMouseWheel = event => {
    const yThreshold = WHEEL_MOVE_Y_THRESHOLD;

    if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      event.stopPropagation();
      // If the vertical scroll amount was large enough, perform a zoom
      if (Math.abs(event.deltaY) < yThreshold) {
        return;
      }

      this.scrollX = 0;
      this.scrollY += event.deltaY;

      this.changeZoom(
        this.state.zoomLevel - event.deltaY,
        event.clientX,
        event.clientY
      );
    }
  };

  handleImageDoubleClick = event => {
    if (this.state.zoomLevel > MIN_ZOOM_LEVEL) {
      // A double click when zoomed in zooms all the way out
      this.changeZoom(MIN_ZOOM_LEVEL, event.clientX, event.clientY);
    } else {
      // A double click when zoomed all the way out zooms in
      this.changeZoom(
        this.state.zoomLevel + ZOOM_BUTTON_INCREMENT_SIZE,
        event.clientX,
        event.clientY
      );
    }
  };

  shouldHandleEvent(source) {
    if (this.eventsSource === source) {
      return true;
    }
    if (this.eventsSource === Source.ANY) {
      this.eventsSource = source;
      return true;
    }
    switch (source) {
      case Source.MOUSE:
        return false;
      case Source.TOUCH:
        this.eventsSource = Source.TOUCH;
        this.filterPointersBySource();
        return true;
      case Source.POINTER:
        if (this.eventsSource === Source.MOUSE) {
          this.eventsSource = Source.POINTER;
          this.filterPointersBySource();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  addPointer(pointer: ParsedEvent) {
    this.pointerList.push(pointer);
  }

  removePointer(pointer: ParsedEvent) {
    this.pointerList = this.pointerList.filter(({ id }) => id !== pointer.id);
  }

  filterPointersBySource() {
    this.pointerList = this.pointerList.filter(
      ({ source }) => source === this.eventsSource
    );
  }

  handleMouseDown = event => {
    if (
      this.shouldHandleEvent(Source.MOUSE) &&
      ReactImageLightbox.isTargetMatchImage(event.target)
    ) {
      this.addPointer(ReactImageLightbox.parseMouseEvent(event));
      this.multiPointerStart(event);
    }
  };

  handleMouseMove = event => {
    if (this.shouldHandleEvent(Source.MOUSE)) {
      this.multiPointerMove(event, [ReactImageLightbox.parseMouseEvent(event)]);
    }
  };

  handleTouchStart = event => {
    if (
      this.shouldHandleEvent(Source.TOUCH) &&
      ReactImageLightbox.isTargetMatchImage(event.target)
    ) {
      [].forEach.call(event.changedTouches, eventTouch =>
        this.addPointer(ReactImageLightbox.parseTouchPointer(eventTouch))
      );
      this.multiPointerStart(event);
    }
  };

  handleTouchMove = event => {
    if (this.shouldHandleEvent(Source.TOUCH)) {
      this.multiPointerMove(
        event,
        [].map.call(event.changedTouches, eventTouch =>
          ReactImageLightbox.parseTouchPointer(eventTouch)
        )
      );
    }
  };

  decideMoveOrSwipe(pointer) {
    if (this.state.zoomLevel <= MIN_ZOOM_LEVEL) {
      this.handleSwipeStart(pointer);
    } else {
      this.handleMoveStart(pointer);
    }
  }

  multiPointerStart(event) {
    this.handleEnd(null);
    switch (this.pointerList.length) {
      case 1: {
        event.preventDefault();
        this.decideMoveOrSwipe(this.pointerList[0]);
        break;
      }
      case 2: {
        event.preventDefault();
        this.handlePinchStart(this.pointerList);
        break;
      }
      default:
        break;
    }
  }

  multiPointerMove(event, pointerList) {
    switch (this.currentAction) {
      case Action.MOVE: {
        event.preventDefault();
        this.handleMove(pointerList[0]);
        break;
      }
      case Action.SWIPE: {
        event.preventDefault();
        this.handleSwipe(pointerList[0]);
        break;
      }
      case Action.PINCH: {
        event.preventDefault();
        this.handlePinch(pointerList);
        break;
      }
      default:
        break;
    }
  }

  multiPointerEnd(event) {
    if (this.currentAction !== Action.NONE) {
      this.setPreventInnerClose();
      this.handleEnd(event);
    }
    switch (this.pointerList.length) {
      case 0: {
        this.eventsSource = Source.ANY;
        break;
      }
      case 1: {
        event.preventDefault();
        this.decideMoveOrSwipe(this.pointerList[0]);
        break;
      }
      case 2: {
        event.preventDefault();
        this.handlePinchStart(this.pointerList);
        break;
      }
      default:
        break;
    }
  }

  handleEnd(event) {
    switch (this.currentAction) {
      case Action.MOVE:
        this.handleMoveEnd();
        break;
      case Action.SWIPE:
        this.handleSwipeEnd(event);
        break;
      case Action.PINCH:
        this.handlePinchEnd();
        break;
      default:
        break;
    }
  }

  // Handle move start over the lightbox container
  // This happens:
  // - On a mouseDown event
  // - On a touchstart event
  handleMoveStart({ x: clientX, y: clientY }) {
    if (!this.props.enableZoom) {
      return;
    }
    this.currentAction = Action.MOVE;
    this.moveStartX = clientX;
    this.moveStartY = clientY;
    this.moveStartOffsetX = this.state.offsetX;
    this.moveStartOffsetY = this.state.offsetY;
  }

  // Handle dragging over the lightbox container
  // This happens:
  // - After a mouseDown and before a mouseUp event
  // - After a touchstart and before a touchend event
  handleMove({ x: clientX, y: clientY }) {
    const newOffsetX = this.moveStartX - clientX + this.moveStartOffsetX;
    const newOffsetY = this.moveStartY - clientY + this.moveStartOffsetY;
    if (
      this.state.offsetX !== newOffsetX ||
      this.state.offsetY !== newOffsetY
    ) {
      this.setState({
        offsetX: newOffsetX,
        offsetY: newOffsetY,
      });
    }
  }

  handleMoveEnd() {
    this.currentAction = Action.NONE;
    this.moveStartX = 0;
    this.moveStartY = 0;
    this.moveStartOffsetX = 0;
    this.moveStartOffsetY = 0;
    // Snap image back into frame if outside max offset range
    const maxOffsets = this.getMaxOffsets();
    const nextOffsetX = Math.max(
      maxOffsets.minX,
      Math.min(maxOffsets.maxX, this.state.offsetX)
    );
    const nextOffsetY = Math.max(
      maxOffsets.minY,
      Math.min(maxOffsets.maxY, this.state.offsetY)
    );
    if (
      nextOffsetX !== this.state.offsetX ||
      nextOffsetY !== this.state.offsetY
    ) {
      this.setState({
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        shouldAnimate: true,
      });
      this.setTimeout(() => {
        this.setState({ shouldAnimate: false });
      }, this.props.animationDuration);
    }
  }

  handleSwipeStart({ x: clientX, y: clientY }) {
    this.currentAction = Action.SWIPE;
    this.swipeStartX = clientX;
    this.swipeStartY = clientY;
    this.swipeEndX = clientX;
    this.swipeEndY = clientY;
  }

  handleSwipe({ x: clientX, y: clientY }) {
    this.swipeEndX = clientX;
    this.swipeEndY = clientY;
  }

  handleSwipeEnd(event) {
    const xDiff = this.swipeEndX - this.swipeStartX;
    const xDiffAbs = Math.abs(xDiff);
    const yDiffAbs = Math.abs(this.swipeEndY - this.swipeStartY);

    this.currentAction = Action.NONE;
    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.swipeEndX = 0;
    this.swipeEndY = 0;

    if (!event || this.isAnimating() || xDiffAbs < yDiffAbs * 1.5) {
      return;
    }

    if (xDiffAbs < MIN_SWIPE_DISTANCE) {
      const boxRect = this.getLightboxRect();
      if (xDiffAbs < boxRect.width / 4) {
        return;
      }
    }

    if (xDiff > 0 && this.props.prevSrc) {
      event.preventDefault();
      this.requestMovePrev();
    } else if (xDiff < 0 && this.props.nextSrc) {
      event.preventDefault();
      this.requestMoveNext();
    }
  }

  calculatePinchDistance([a, b] = this.pinchTouchList || []) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  calculatePinchCenter([a, b] = this.pinchTouchList) {
    return {
      x: a.x - (a.x - b.x) / 2,
      y: a.y - (a.y - b.y) / 2,
    };
  }

  handlePinchStart(pointerList) {
    if (!this.props.enableZoom) {
      return;
    }
    this.currentAction = Action.PINCH;
    this.pinchTouchList = pointerList.map(({ id, x, y }) => ({ id, x, y }));
    this.pinchDistance = this.calculatePinchDistance();
  }

  handlePinch(pointerList) {
    this.pinchTouchList = this.pinchTouchList.map(oldPointer => {
      for (let i = 0; i < pointerList.length; i += 1) {
        if (pointerList[i].id === oldPointer.id) {
          return pointerList[i];
        }
      }

      return oldPointer;
    });

    const newDistance = this.calculatePinchDistance();

    const zoomLevel = this.state.zoomLevel + newDistance - this.pinchDistance;

    this.pinchDistance = newDistance;
    const { x: clientX, y: clientY } = this.calculatePinchCenter(
      this.pinchTouchList
    );
    this.changeZoom(zoomLevel, clientX, clientY);
  }

  handlePinchEnd() {
    this.currentAction = Action.NONE;
    this.pinchTouchList = [];
    this.pinchDistance = 0;
  }

  handleZoomInButtonClick = () => {
    const nextZoomLevel = this.state.zoomLevel + ZOOM_BUTTON_INCREMENT_SIZE;
    this.changeZoom(nextZoomLevel);
    if (nextZoomLevel === MAX_ZOOM_LEVEL) {
      this.zoomOutBtn.current?.focus();
    }
  };

  handleZoomOutButtonClick = () => {
    const nextZoomLevel = this.state.zoomLevel - ZOOM_BUTTON_INCREMENT_SIZE;
    this.changeZoom(nextZoomLevel);
    if (nextZoomLevel === MIN_ZOOM_LEVEL) {
      this.zoomInBtn.current?.focus();
    }
  };

  handleCaptionMousewheel = event => {
    event.stopPropagation();

    if (!this.caption.current) {
      return;
    }

    const { height } = this.caption.current?.getBoundingClientRect();
    const { scrollHeight, scrollTop } = this.caption.current;
    if (
      (event.deltaY > 0 && height + scrollTop >= scrollHeight) ||
      (event.deltaY < 0 && scrollTop <= 0)
    ) {
      event.preventDefault();
    }
  };

  // Detach key and mouse input events
  isAnimating() {
    return this.state.shouldAnimate || this.state.isClosing;
  }

  // Check if image is loaded
  isImageLoaded(imageSrc) {
    return (
      imageSrc &&
      imageSrc in this.imageCache &&
      this.imageCache[imageSrc].loaded
    );
  }

  // Load image from src and call callback with image width and height on load
  loadImage(srcType, imageSrc, done) {
    // Return the image info if it is already cached
    if (this.isImageLoaded(imageSrc)) {
      this.setTimeout(() => {
        done();
      }, 1);
      return;
    }

    const inMemoryImage = new global.Image();

    if (this.props.imageCrossOrigin) {
      inMemoryImage.crossOrigin = this.props.imageCrossOrigin;
    }

    inMemoryImage.onerror = errorEvent => {
      this.props.onImageLoadError(imageSrc, srcType, errorEvent);

      // failed to load so set the state loadErrorStatus
      this.setState(prevState => ({
        loadErrorStatus: { ...prevState.loadErrorStatus, [srcType]: true },
      }));

      done(errorEvent);
    };

    inMemoryImage.onload = () => {
      this.props.onImageLoad(imageSrc, srcType, inMemoryImage);

      this.imageCache[imageSrc] = {
        loaded: true,
        width: inMemoryImage.width,
        height: inMemoryImage.height,
      };

      done();
    };

    inMemoryImage.src = imageSrc;
  }

  // Load all images and their thumbnails
  loadAllImages(props = this.props) {
    const generateLoadDoneCallback = (srcType, imageSrc) => err => {
      // Give up showing image on error
      if (err) {
        return;
      }

      // Don't rerender if the src is not the same as when the load started
      // or if the component has unmounted
      if (this.props[srcType] !== imageSrc || this.didUnmount) {
        return;
      }

      // Force rerender with the new image
      this.forceUpdate();
    };

    // Load the images
    this.getSrcTypes().forEach(srcType => {
      const type = srcType.name;

      // there is no error when we try to load it initially
      if (props[type] && this.state.loadErrorStatus[type]) {
        this.setState(prevState => ({
          loadErrorStatus: { ...prevState.loadErrorStatus, [type]: false },
        }));
      }

      // Load unloaded images
      if (props[type] && !this.isImageLoaded(props[type])) {
        this.loadImage(
          type,
          props[type],
          generateLoadDoneCallback(type, props[type])
        );
      }
    });
  }

  // Request that the lightbox be closed
  requestClose = event => {
    // Call the parent close request
    const closeLightbox = () => this.props.onCloseRequest(event);

    if (
      this.props.animationDisabled ||
      (event.type === 'keydown' && !this.props.animationOnKeyInput)
    ) {
      // No animation
      closeLightbox();
      return;
    }

    // With animation
    // Start closing animation
    this.setState({ isClosing: true });

    // Perform the actual closing at the end of the animation
    this.setTimeout(closeLightbox, this.props.animationDuration);
  };

  requestMove(direction) {
    // Reset the zoom level on image move
    const nextState: State = {
      zoomLevel: MIN_ZOOM_LEVEL,
      offsetX: 0,
      offsetY: 0,
      loadErrorStatus: {},
    };

    // Enable animated states
    if (
      !this.props.animationDisabled &&
      (!this.keyPressed || this.props.animationOnKeyInput)
    ) {
      nextState.shouldAnimate = true;
      this.setTimeout(
        () => this.setState({ shouldAnimate: false }),
        this.props.animationDuration
      );
    }
    this.keyPressed = false;

    this.moveRequested = true;

    if (direction === 'prev') {
      this.keyCounter -= 1;
      this.setState(nextState);
      this.props.onMovePrevRequest();
    } else {
      this.keyCounter += 1;
      this.setState(nextState);
      this.props.onMoveNextRequest();
    }
  }

  // Request to transition to the next image
  requestMoveNext = () => {
    this.requestMove('next');
  };

  // Request to transition to the previous image
  requestMovePrev = () => {
    this.requestMove('prev');
  };

  render() {
    const {
      animationDisabled,
      animationDuration,
      clickOutsideToClose,
      discourageDownloads,
      enableZoom,
      imageTitle,
      nextSrc,
      prevSrc,
      toolbarButtons,
      onAfterOpen,
      imageCrossOrigin,
    } = this.props;
    const {
      zoomLevel,
      offsetX,
      offsetY,
      isClosing,
      loadErrorStatus,
    } = this.state;

    const boxSize = this.getLightboxRect();
    let transitionStyle = {};

    // Transition settings for sliding animations
    if (!animationDisabled && this.isAnimating()) {
      transitionStyle = {
        ...transitionStyle,
        transition: `transform ${animationDuration}ms`,
      };
    }

    // Key endings to differentiate between images with the same src
    const keyEndings = {};
    this.getSrcTypes().forEach(({ name, keyEnding }) => {
      keyEndings[name] = keyEnding;
    });

    // Images to be displayed
    const images: ReactNode[] = [];
    const addImage = (srcType, imageClass, transforms) => {
      // Ignore types that have no source defined for their full size image
      if (!this.props[srcType]) {
        return;
      }
      const bestImageInfo = this.getBestImageForType(srcType);

      const imageStyle = {
        ...transitionStyle,
        ...ReactImageLightbox.getTransform({
          ...transforms,
          ...bestImageInfo,
        }),
      };

      if (zoomLevel > MIN_ZOOM_LEVEL) {
        imageStyle['cursor'] = 'move';
      }

      // support IE 9 and 11
      const hasTrueValue = object =>
        Object.keys(object).some(key => object[key]);

      // when error on one of the loads then push custom error stuff
      if (bestImageInfo === null && hasTrueValue(loadErrorStatus)) {
        images.push(
          <div
            className={`${imageClass} ril__image ril-errored`}
            style={imageStyle}
            key={this.props[srcType] + keyEndings[srcType]}
          >
            <div className="ril__errorContainer">
              {this.props.imageLoadErrorMessage}
            </div>
          </div>
        );

        return;
      }
      if (bestImageInfo === null) {
        const loadingIcon = (
          <div className="ril-loading-circle ril__loadingCircle ril__loadingContainer__icon">
            {[...new Array(12)].map((_, index) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className="ril-loading-circle-point ril__loadingCirclePoint"
              />
            ))}
          </div>
        );

        // Fall back to loading icon if the thumbnail has not been loaded
        images.push(
          <div
            className={`${imageClass} ril__image ril-not-loaded`}
            style={imageStyle}
            key={this.props[srcType] + keyEndings[srcType]}
          >
            <div className="ril__loadingContainer">{loadingIcon}</div>
          </div>
        );

        return;
      }

      const imageSrc = bestImageInfo.src;
      if (discourageDownloads) {
        imageStyle['backgroundImage'] = `url('${imageSrc}')`;
        images.push(
          <div
            className={`${imageClass} ril__image ril__imageDiscourager`}
            onDoubleClick={this.handleImageDoubleClick}
            onWheel={this.handleImageMouseWheel}
            style={imageStyle}
            key={imageSrc + keyEndings[srcType]}
          >
            <div className="ril-download-blocker ril__downloadBlocker" />
          </div>
        );
      } else {
        images.push(
          <img
            {...(imageCrossOrigin ? { crossOrigin: imageCrossOrigin } : {})}
            className={`${imageClass} ril__image`}
            onDoubleClick={this.handleImageDoubleClick}
            onWheel={this.handleImageMouseWheel}
            onDragStart={e => e.preventDefault()}
            style={imageStyle}
            src={imageSrc}
            key={imageSrc + keyEndings[srcType]}
            alt={typeof imageTitle === 'string' ? imageTitle : 'Image'}
            draggable={false}
          />
        );
      }
    };

    const zoomMultiplier = this.getZoomMultiplier();
    // Next Image (displayed on the right)
    addImage('nextSrc', 'ril-image-next ril__imageNext', {
      x: boxSize.width,
    });
    // Main Image
    addImage('mainSrc', 'ril-image-current', {
      x: -1 * offsetX,
      y: -1 * offsetY,
      zoom: zoomMultiplier,
    });
    // Previous Image (displayed on the left)
    addImage('prevSrc', 'ril-image-prev ril__imagePrev', {
      x: -1 * boxSize.width,
    });

    const modalStyle = {
      overlay: {
        zIndex: 1000,
        backgroundColor: 'transparent',
      },
      content: {
        backgroundColor: 'transparent',
        overflow: 'hidden', // Needed, otherwise keyboard shortcuts scroll the page
        border: 'none',
        borderRadius: 0,
        padding: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    };

    return (
      <Modal
        isOpen
        onRequestClose={clickOutsideToClose ? this.requestClose : undefined}
        onAfterOpen={() => {
          // Focus on the div with key handlers
          if (this.outerEl.current) {
            this.outerEl.current.focus();
          }

          onAfterOpen();
        }}
        style={modalStyle}
        contentLabel={'Lightbox'}
        appElement={
          typeof global.window !== 'undefined'
            ? global.window.document.body
            : undefined
        }
      >
        <div // eslint-disable-line jsx-a11y/no-static-element-interactions
          // Floating modal with closing animations
          className={`ril-outer ril__outer ril__outerAnimating ${
            this.props.wrapperClassName
          } ${isClosing ? 'ril-closing ril__outerClosing' : ''}`}
          style={{
            transition: `opacity ${animationDuration}ms`,
            animationDuration: `${animationDuration}ms`,
            animationDirection: isClosing ? 'normal' : 'reverse',
          }}
          ref={this.outerEl}
          onWheel={this.handleOuterMousewheel}
          onMouseMove={this.handleMouseMove}
          onMouseDown={this.handleMouseDown}
          onTouchStart={this.handleTouchStart}
          onTouchMove={this.handleTouchMove}
          tabIndex={-1} // Enables key handlers on div
          onKeyDown={this.handleKeyInput}
          onKeyUp={this.handleKeyInput}
        >
          <div // eslint-disable-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
            // Image holder
            className="ril-inner ril__inner"
            onClick={clickOutsideToClose ? this.closeIfClickInner : undefined}
          >
            {images}
          </div>

          {prevSrc && (
            <button // Move to previous image button
              type="button"
              className="ril-prev-button ril__navButtons ril__navButtonPrev"
              key="prev"
              aria-label={this.props.prevLabel}
              onClick={!this.isAnimating() ? this.requestMovePrev : undefined} // Ignore clicks during animation
            />
          )}

          {nextSrc && (
            <button // Move to next image button
              type="button"
              className="ril-next-button ril__navButtons ril__navButtonNext"
              key="next"
              aria-label={this.props.nextLabel}
              onClick={!this.isAnimating() ? this.requestMoveNext : undefined} // Ignore clicks during animation
            />
          )}

          <div // Lightbox toolbar
            className="ril-toolbar ril__toolbar"
          >
            <ul className="ril-toolbar-left ril__toolbarSide ril__toolbarLeftSide">
              <li className="ril-toolbar__item ril__toolbarItem">
                <span className="ril-toolbar__item__child ril__toolbarItemChild">
                  {imageTitle}
                </span>
              </li>
            </ul>

            <ul className="ril-toolbar-right ril__toolbarSide ril__toolbarRightSide">
              {toolbarButtons &&
                toolbarButtons.map((button, i) => (
                  <li
                    key={`button_${i + 1}`}
                    className="ril-toolbar__item ril__toolbarItem"
                  >
                    {button}
                  </li>
                ))}

              {enableZoom && (
                <li className="ril-toolbar__item ril__toolbarItem">
                  <button // Lightbox zoom in button
                    type="button"
                    key="zoom-in"
                    aria-label={this.props.zoomInLabel}
                    className={[
                      'ril-zoom-in',
                      'ril__toolbarItemChild',
                      'ril__builtinButton',
                      'ril__zoomInButton',
                      ...(zoomLevel === MAX_ZOOM_LEVEL
                        ? ['ril__builtinButtonDisabled']
                        : []),
                    ].join(' ')}
                    ref={this.zoomInBtn}
                    disabled={
                      this.isAnimating() || zoomLevel === MAX_ZOOM_LEVEL
                    }
                    onClick={
                      !this.isAnimating() && zoomLevel !== MAX_ZOOM_LEVEL
                        ? this.handleZoomInButtonClick
                        : undefined
                    }
                  />
                </li>
              )}

              {enableZoom && (
                <li className="ril-toolbar__item ril__toolbarItem">
                  <button // Lightbox zoom out button
                    type="button"
                    key="zoom-out"
                    aria-label={this.props.zoomOutLabel}
                    className={[
                      'ril-zoom-out',
                      'ril__toolbarItemChild',
                      'ril__builtinButton',
                      'ril__zoomOutButton',
                      ...(zoomLevel === MIN_ZOOM_LEVEL
                        ? ['ril__builtinButtonDisabled']
                        : []),
                    ].join(' ')}
                    ref={this.zoomOutBtn}
                    disabled={
                      this.isAnimating() || zoomLevel === MIN_ZOOM_LEVEL
                    }
                    onClick={
                      !this.isAnimating() && zoomLevel !== MIN_ZOOM_LEVEL
                        ? this.handleZoomOutButtonClick
                        : undefined
                    }
                  />
                </li>
              )}

              <li className="ril-toolbar__item ril__toolbarItem">
                <button // Lightbox close button
                  type="button"
                  key="close"
                  aria-label={this.props.closeLabel}
                  className="ril-close ril-toolbar__item__child ril__toolbarItemChild ril__builtinButton ril__closeButton"
                  onClick={!this.isAnimating() ? this.requestClose : undefined} // Ignore clicks during animation
                />
              </li>
            </ul>
          </div>

          {this.props.imageCaption && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div // Image caption
              onWheel={this.handleCaptionMousewheel}
              onMouseDown={event => event.stopPropagation()}
              className="ril-caption ril__caption"
              ref={this.caption}
            >
              <div className="ril-caption-content ril__captionContent">
                {this.props.imageCaption}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }
}

export default ReactImageLightbox;
