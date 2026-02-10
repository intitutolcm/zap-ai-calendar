export async function handleUpdateLeadStage(supabase: any, contactId: string, status: string) {
    console.log(`[Lead Stage Update] Contact: ${contactId}, New Status: ${status}`);

    // Validar status permitido
    const validStatuses = ["Novo", "Interesse", "Agendado", "Faturado", "Perdido"];
    if (!validStatuses.includes(status)) {
        throw new Error(`Status inválido: ${status}. Use apenas: ${validStatuses.join(", ")}`);
    }

    const { error } = await supabase
        .from('contacts')
        .update({ status })
        .eq('id', contactId);

    if (error) {
        console.error("Erro ao atualizar status:", error);
        throw new Error(`Erro ao atualizar status: ${error.message}`);
    }

    return `Status do lead atualizado para: ${status}`;
}
