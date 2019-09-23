import { TestBed } from '@angular/core/testing';

import { DragDropRegistryService } from './drag-drop-registry.service';

describe('DragDropRegistryService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: DragDropRegistryService = TestBed.get(DragDropRegistryService);
    expect(service).toBeTruthy();
  });
});
