import { SubmissionsService } from './submissions.service';
export declare class SubmissionsController {
    private readonly submissionsService;
    constructor(submissionsService: SubmissionsService);
    findAll(): string[];
    findOne(id: string): string;
    create(payload: {
        learnerId: string;
        taskId: string;
        content: string;
    }): string;
}
