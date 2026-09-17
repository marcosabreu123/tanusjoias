/**
 * Regra de senha, em módulo próprio e sem Prisma: os formulários são
 * componentes client e precisam do mesmo mínimo que o servidor exige — importar
 * `lib/usuarios.ts` no client arrastaria banco e bcrypt para o bundle.
 */
export const TAMANHO_MINIMO_SENHA = 6;
