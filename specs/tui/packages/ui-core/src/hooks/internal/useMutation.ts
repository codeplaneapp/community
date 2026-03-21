import { useState, useRef, useCallback, useEffect } from "react";
import type { HookError } from "../../types/errors.js";

export interface MutationConfig<TInput, TOutput> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (output: TOutput, input: TInput) => void;
  onError?: (error: HookError, input: TInput) => void;
  onSettled?: (input: TInput) => void;
}

export interface MutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  isLoading: boolean;
  error: HookError | null;
  reset: () => void;
}

export function useMutation<TInput, TOutput>(
  config: MutationConfig<TInput, TOutput>
): MutationResult<TInput, TOutput> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<HookError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  // Store config in refs to avoid dependency changes triggering re-renders
  // or stale closures in mutate
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const mutate = useCallback(async (input: TInput): Promise<TOutput> => {
    if (isLoading) {
      return Promise.reject(new Error("mutation in progress"));
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const { mutationFn, onOptimistic, onSuccess, onError, onSettled } = configRef.current;

    try {
      if (onOptimistic) {
        onOptimistic(input);
      }

      const result = await mutationFn(input, controller.signal);

      if (isMounted.current) {
        setIsLoading(false);
      }

      if (onSuccess) {
        onSuccess(result, input);
      }
      if (onSettled) {
        onSettled(input);
      }

      return result;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return Promise.reject(err);
      }

      if (isMounted.current) {
        setError(err);
        setIsLoading(false);
      }

      if (onError) {
        onError(err, input);
      }
      if (onSettled) {
        onSettled(input);
      }

      throw err;
    }
  }, [isLoading]);

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, isLoading, error, reset };
}