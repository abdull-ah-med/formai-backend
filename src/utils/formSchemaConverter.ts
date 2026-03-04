/**
 * This utility file provides conversion functions between different form schema formats
 * used in the application. It helps maintain compatibility between the Claude API format
 * and the database schema format.
 */

import { FormSchema as UserFormSchema } from "../models/user.model";
import { FormSchema as ClaudeFormSchema } from "./claudeClient";

/**
 * Converts a Claude API form schema to the user model form schema format
 */
export function convertClaudeSchemaToUserSchema(claudeSchema: ClaudeFormSchema): UserFormSchema {
    const userSchema: UserFormSchema = {
        title: claudeSchema.title,
        description: claudeSchema.description,
        questions: [],
    };

    // Handle sections-based schema (newer format)
    if (claudeSchema.sections && claudeSchema.sections.length > 0) {
        // Convert sections to questions
        claudeSchema.sections.forEach((section) => {
            section.fields.forEach((field) => {
                userSchema.questions.push({
                    id: Math.random().toString(36).substring(2, 15),
                    type: field.type === "dropdown" ? "dropdown" : "short_answer",
                    label: field.label,
                    options: field.options?.map((opt) => {
                        if (typeof opt === "string") {
                            return {
                                id: Math.random().toString(36).substring(2, 15),
                                text: opt,
                            };
                        } else {
                            return {
                                id: Math.random().toString(36).substring(2, 15),
                                text: opt.text || opt.label || "",
                            };
                        }
                    }),
                });
            });
        });
    }
    // Handle fields-based schema (older format)
    else if (claudeSchema.fields && claudeSchema.fields.length > 0) {
        claudeSchema.fields.forEach((field) => {
            userSchema.questions.push({
                id: Math.random().toString(36).substring(2, 15),
                type: field.type === "dropdown" ? "dropdown" : "short_answer",
                label: field.label,
                options: field.options?.map((opt) => {
                    if (typeof opt === "string") {
                        return {
                            id: Math.random().toString(36).substring(2, 15),
                            text: opt,
                        };
                    } else {
                        return {
                            id: Math.random().toString(36).substring(2, 15),
                            text: opt.text || opt.label || "",
                        };
                    }
                }),
            });
        });
    }

    return userSchema;
}

/**
 * Converts a user model form schema to the Claude API schema format
 */
export function convertUserSchemaToClaudeSchema(userSchema: UserFormSchema): ClaudeFormSchema {
    const claudeSchema: ClaudeFormSchema = {
        title: userSchema.title,
        description: userSchema.description,
        fields: userSchema.questions.map((question) => ({
            label: question.label,
            type: question.type === "dropdown" ? "dropdown" : "text",
            required: false,
            options: question.options?.map((opt) => opt.text),
        })),
        sections: [
            {
                title: userSchema.title,
                description: userSchema.description,
                fields: userSchema.questions.map((question) => ({
                    label: question.label,
                    type: question.type === "dropdown" ? "dropdown" : "text",
                    required: false,
                    options: question.options?.map((opt) => opt.text),
                })),
            },
        ],
    };

    return claudeSchema;
}
