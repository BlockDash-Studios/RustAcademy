import { AiService } from './ai.service';
import { CreateChatRequestDto } from './dto/create-chat-request.dto';
import { GetHintDto } from './dto/get-hint.dto';
import { ChatMessage } from './interfaces/ai.interface';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    sendChatMessage(createChatRequestDto: CreateChatRequestDto): Promise<import("./interfaces/ai.interface").AiChatResponse>;
    getHint(getHintDto: GetHintDto): Promise<import("./interfaces/ai.interface").AiHintResponse>;
    getChatHistory(userId: string): Promise<ChatMessage[]>;
}
