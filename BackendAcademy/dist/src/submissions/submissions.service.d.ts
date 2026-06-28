export declare class SubmissionsService {
    private readonly submissions;
    findAll(): string[];
    findOne(id: string): string;
    create(payload: {
        learnerId: string;
        taskId: string;
        content: string;
    }): string;
}
