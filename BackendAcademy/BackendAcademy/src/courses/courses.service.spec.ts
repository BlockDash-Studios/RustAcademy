import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';

describe('CoursesService', () => {
  // Holds the instance of the service under test
  let service: CoursesService;

  // Runs before each test: builds a fresh testing module and resolves the service
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoursesService],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
  });

  // Sanity check: the service should be instantiated correctly by the DI container
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // create() should return the submitted data merged with a generated id
  it('create() returns the dto with an id', () => {
    const result = service.create({
      title: 'Rust Basics',
      description: 'An intro to Rust programming language.',
    });

    // The returned object should contain the same title we passed in
    expect(result).toMatchObject({ title: 'Rust Basics' });

    // An id should have been generated for the new course
    expect(result.id).toBeDefined();
  });

  // findAll() should always return an array (even if empty)
  it('findAll() returns an array', () => {
    expect(Array.isArray(service.findAll())).toBe(true);
  });

  // findOne() should throw a NotFoundException when the course doesn't exist
  it('findOne() throws NotFoundException for unknown id', () => {
    expect(() => service.findOne(999)).toThrow(NotFoundException);
  });
});
