import { CreateChatRequestDto } from './dto/create-chat-request.dto';
import { GetHintDto } from './dto/get-hint.dto';
import { AiChatResponse, AiHintResponse, ChatMessage } from './interfaces/ai.interface';
export declare class AiService {
    private chatHistory;
    private hints;
    constructor();
    processChatRequest(createChatRequestDto: CreateChatRequestDto): Promise<AiChatResponse>;
    getHint(getHintDto: GetHintDto): Promise<AiHintResponse>;
    getChatHistory(userId: string): Promise<ChatMessage[]>;
    private generateAiResponse;
    private initializeSampleHints;
}
