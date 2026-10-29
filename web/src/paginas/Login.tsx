import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Aviso } from '../componentes/Aviso';
import { Cargando } from '../componentes/Cargando';
import { useRutas } from '../rutas/contexto';
import { destinoSeguro } from '../rutas/volver';
import { useIniciarSesion, useSesion } from '../sesion/SesionProvider';
import estilos from './Login.module.css';

const esquema = z.object({
  email: z.email({ error: 'Ingresa un correo válido.' }),
  password: z.string().min(1, { error: 'Ingresa tu contraseña.' }),
});

type Datos = z.infer<typeof esquema>;

export function Login() {
  const estado = useIniciarSesion();
  const { sesion } = useSesion();
  const rutas = useRutas();
  const [parametros] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) });

  // No se muestra el formulario hasta saber si ya hay sesión (refresh silencioso).
  if (estado.fase === 'inicial' || estado.fase === 'cargando') return <Cargando />;
  if (estado.fase === 'autenticada') {
    return <Navigate to={destinoSeguro(parametros.get('volver'), rutas, window.location.origin)} replace />;
  }

  async function enviar(datos: Datos) {
    setError(null);
    sesion.descartarAviso();
    const resultado = await sesion.login(datos.email, datos.password);
    if (!resultado.ok) setError(resultado.mensaje);
  }

  return (
    <main className={estilos.pagina}>
      <form className={estilos.tarjeta} onSubmit={handleSubmit(enviar)} noValidate>
        <h1>
          <span className={estilos.marca}>FlotaÁgil</span> Iniciar sesión
        </h1>
        {estado.aviso && <Aviso>{estado.aviso}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <label className={estilos.campo}>
          Correo
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          {errors.email && <span className={estilos.errorCampo}>{errors.email.message}</span>}
        </label>
        <label className={estilos.campo}>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          {errors.password && <span className={estilos.errorCampo}>{errors.password.message}</span>}
        </label>
        <button type="submit" className={estilos.boton} disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
