import type { GuideChapter } from './types';

export const PERSONAL: GuideChapter = {
  id: 'personal',
  title: 'Personal y accesos',
  eyebrow: 'Dueño',
  icon: 'users',
  summary: 'Crear usuarios, asignar roles, manejar los PIN y dar de baja a alguien.',
  intro:
    'Cada persona que toca el sistema tiene su propio usuario. No se comparten cuentas: la auditoría solo sirve si el nombre que aparece es el de quien hizo la acción.',
  sections: [
    {
      id: 'crear-usuario',
      title: 'Crear un usuario',
      audience: ['dueno'],
      where: 'Gestión → Personal → Usuarios',
      summary: 'Correo, contraseña y rol.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Toca "Nuevo usuario" y escribe nombre completo y correo.' },
            {
              do: 'Elige el rol. Define a qué pantallas entra.',
              why: 'Admin operativo para quien atiende la caja, cocinero para la cocina, dueño para gestión completa. Trabajador es para alguien a quien se le paga pero no entra al sistema.',
            },
            { do: 'Asigna la contraseña inicial y pídele que la cambie.' },
          ],
        },
        {
          kind: 'warn',
          text: 'No compartas una cuenta entre dos personas. Si dos cajeros usan el mismo usuario, ni la bitácora ni el reporte de anomalías sirven para nada: no hay forma de saber quién hizo qué.',
        },
      ],
    },
    {
      id: 'pin',
      title: 'El PIN de aprobación',
      audience: ['dueno'],
      where: 'Gestión → Personal → Usuarios',
      summary: 'Seis dígitos para autorizar lo que cuesta plata.',
      blocks: [
        {
          kind: 'prose',
          text: 'El PIN es distinto de la contraseña: no sirve para entrar, sirve para autorizar. Se pide al anular una venta, al reembolsar y al abrir el cajón sin venta. Solo el admin operativo y el dueño pueden tener uno.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Desde la lista de usuarios, asigna o cambia el PIN de quien corresponda.' },
            { do: 'Cada persona puede cambiar el suyo desde su propio menú.' },
          ],
        },
        {
          kind: 'rule',
          title: 'El PIN se teclea en el momento',
          text: 'Quien tiene el PIN debe escribirlo cuando pasa la situación. Dejarlo escrito en un papel al lado de la caja anula el control por completo — un intento fallido también queda registrado, y esa es la señal que quieres poder leer.',
        },
      ],
    },
    {
      id: 'salida',
      title: 'Cuando alguien se va',
      audience: ['dueno'],
      where: 'Gestión → Personal → Usuarios',
      summary: 'Se da de baja, no se borra.',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { do: 'Abre el usuario y usa la opción de terminar la relación laboral, con la fecha.' },
            {
              do: 'La cuenta deja de entrar, pero el histórico queda intacto.',
              why: 'Sus ventas, sus turnos y sus registros siguen siendo parte de la historia del negocio. Borrarlo dejaría huecos en los reportes de meses que ya cerraste.',
            },
          ],
        },
      ],
    },
    {
      id: 'medios-pago',
      title: 'Medios de pago',
      audience: ['dueno'],
      where: 'Gestión → Caja → Medios de pago',
      summary: 'Qué formas de pago acepta la caja.',
      blocks: [
        {
          kind: 'prose',
          text: 'La lista es tuya: puedes crear, renombrar, activar, desactivar y borrar medios. Cada uno define si pide verificar comprobante y si se cruza con algún extracto bancario.',
        },
        {
          kind: 'steps',
          steps: [
            { do: 'Agrega el medio con el nombre que quieres que vea el cajero.' },
            {
              do: 'Marca si pide verificar comprobante.',
              why: 'Eso es lo que hace que la caja obligue a confirmar el pago antes de cobrar. Es por medio, no por tipo.',
            },
            { do: 'Si el banco da extracto, elige cuál para la reconciliación.' },
          ],
        },
        {
          kind: 'rule',
          title: 'Efectivo no se borra y nunca queda todo apagado',
          text: 'Efectivo es del sistema: el cajón, el arqueo y el respaldo sin internet dependen de él. Y el sistema no te deja dejar cero medios activos: la caja quedaría sin forma de cobrar.',
        },
        {
          kind: 'note',
          text: 'Un medio creado por ti es siempre digital. En arqueos y reportes viejos puede aparecer por su código en vez de su nombre; en el cobro siempre sale el nombre.',
        },
      ],
    },
    {
      id: 'turnero',
      title: 'La pantalla del local',
      audience: ['dueno'],
      where: 'Gestión → Operación → Turnero',
      summary: 'Qué muestra el televisor del salón.',
      blocks: [
        {
          kind: 'prose',
          text: 'La pantalla del local pasa imágenes de productos y publicidad, con música de fondo. No muestra turnos ni pedidos. Desde acá cargas las imágenes y las canciones, y defines el orden.',
        },
        {
          kind: 'note',
          text: 'Corre sola: no necesita que nadie inicie sesión. Se abre en el televisor y se queda ahí.',
        },
      ],
    },
  ],
};
