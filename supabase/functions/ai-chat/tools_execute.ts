import {
    handleListServices,
    handleListProfessionals,
    handleListMyAppointments,
    handleCancelAppointment,
    handleGetAvailableSlots,
    handleCreateAppointment
} from "./tools_appointments.ts";
import {
    handleGeneratePayment,
    handleCheckPaymentStatus
} from "./tools_payments.ts";
import { handleUpdateLeadStage } from "./tools_leads.ts";

export async function executeTool(
    functionName: string,
    args: any,
    supabase: any,
    inst: any,
    conversation: any
) {
    try {
        switch (functionName) {
            case "list_services":
                return await handleListServices(supabase, inst.company_id);
            case "list_professionals":
                return await handleListProfessionals(supabase, inst.company_id);
            case "list_my_appointments":
                return await handleListMyAppointments(supabase, conversation.contact_id);
            case "cancel_appointment":
                return await handleCancelAppointment(supabase, args.appointment_id);
            case "get_available_slots":
                return await handleGetAvailableSlots(supabase, args);
            case "create_appointment":
                return await handleCreateAppointment(supabase, args, conversation.contact_id, inst.company_id);
            case "generate_payment":
                return await handleGeneratePayment(supabase, args, inst.company_id);
            case "check_payment_status":
                return await handleCheckPaymentStatus(supabase, args);
            case "update_lead_stage":
                return await handleUpdateLeadStage(supabase, conversation.contact_id, args.status);
            default:
                return `Erro: Ferramenta ${functionName} não implementada.`;
        }
    } catch (e: any) {
        return `Erro ao executar ${functionName}: ${e.message}`;
    }
}
