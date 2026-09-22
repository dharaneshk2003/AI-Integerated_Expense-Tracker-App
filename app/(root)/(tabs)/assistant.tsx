import { useBudgetQuery } from "@/hooks/queries/useBudgetQuery";
import { useTransactionsQuery } from "@/hooks/queries/useTransactionsQuery";
import { askAssistant } from "@/lib/services/assistant";
import { useUserStore } from "@/store/userStore";
import { useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTED_PROMPTS = [
  "How much did I spend on food this month?",
  "What's my biggest expense this week?",
  "Am I over budget anywhere?",
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hi! Ask me anything about your spending or budgets in last 30 days.",
  },
];

function MessageBubble({
  message,
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === "user";

  return (
    <View
      className={`mb-3 max-w-[85%] ${
        isUser ? "self-end" : "self-start"
      }`}
    >
      <View
        className={`rounded-2xl px-3.5 py-2.5 ${
          isUser
            ? "bg-brand-bg"
            : "border border-[#E8E6DF] bg-white"
        }`}
      >
        <Text
          className={`text-sm ${
            isUser ? "text-white" : "text-brand-bg"
          }`}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default function AssistantScreen() {
  const { user } = useUser();

  const currency = useUserStore(
    (state) => state.currency
  );

  const {
    refetch: refetchTransactions,
  } = useTransactionsQuery();

  const {
    refetch: refetchBudget,
  } = useBudgetQuery();

  const [messages, setMessages] =
    useState<ChatMessage[]>(INITIAL_MESSAGES);

  const [input, setInput] = useState("");

  const [sending, setSending] = useState(false);

  /*
   * Controls how much the input bar moves
   * when the keyboard opens.
   */
  const inputTranslateY = useRef(
    new Animated.Value(0)
  ).current;

  /*
   * Reference to FlatList
   */
  const flatListRef =
    useRef<FlatList<ChatMessage>>(null);

  /*
   * ================================
   * KEYBOARD HANDLING
   * ================================
   */

  useEffect(() => {
    const keyboardShowEvent =
      Platform.OS === "ios"
        ? "keyboardWillShow"
        : "keyboardDidShow";

    const keyboardHideEvent =
      Platform.OS === "ios"
        ? "keyboardWillHide"
        : "keyboardDidHide";

    /*
     * Keyboard OPEN
     */
    const keyboardShowListener =
      Keyboard.addListener(
        keyboardShowEvent,
        (event) => {
          const keyboardHeight =
            event.endCoordinates.height;

          Animated.timing(inputTranslateY, {
            toValue: -(keyboardHeight -35),
            duration:
              Platform.OS === "ios"
                ? 250
                : 200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      );

    /*
     * Keyboard CLOSE
     */
    const keyboardHideListener =
      Keyboard.addListener(
        keyboardHideEvent,
        () => {
          Animated.timing(inputTranslateY, {
            toValue: 0,
            duration:
              Platform.OS === "ios"
                ? 250
                : 200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      );

    /*
     * Cleanup listeners
     */
    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, [inputTranslateY]);

  /*
   * ================================
   * AUTO SCROLL
   * ================================
   */

  useEffect(() => {
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({
        animated: true,
      });
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [messages]);

  /*
   * ================================
   * SEND MESSAGE
   * ================================
   */

  const sendMessage = async (text: string) => {
    const trimmedText = text.trim();

    if (
      !trimmedText ||
      sending ||
      !user
    ) {
      return;
    }

    /*
     * User message
     */
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedText,
    };

    /*
     * Add user message
     */
    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    /*
     * Clear input
     */
    setInput("");

    /*
     * Loading state
     */
    setSending(true);

    try {
      /*
       * Fetch latest data
       */
      const [
        {
          data: transactions = [],
        },
        {
          data: budget = null,
        },
      ] = await Promise.all([
        refetchTransactions(),
        refetchBudget(),
      ]);

      /*
       * Ask AI
       */
      const reply = await askAssistant(
        trimmedText,
        transactions,
        budget,
        currency
      );

      /*
       * Assistant response
       */
      const assistantMessage: ChatMessage = {
        id: (
          Date.now() + 1
        ).toString(),
        role: "assistant",
        content: reply,
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (error) {
      console.error(
        "Assistant error:",
        error
      );

      /*
       * Error response
       */
      setMessages((previous) => [
        ...previous,
        {
          id: (
            Date.now() + 1
          ).toString(),
          role: "assistant",
          content:
            "Sorry, something went wrong answering that. Try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  /*
   * ================================
   * UI
   * ================================
   */

  return (
    <SafeAreaView
      className="flex-1 bg-brand-body"
      edges={["top"]}
    >
      {/* ================= HEADER ================= */}

      <View className="px-5 pb-3 pt-3">
        <Text className="text-xl font-semibold text-brand-bg">
          Assistant
        </Text>
      </View>

      {/* ================= MAIN CONTENT ================= */}

      <View className="flex-1">

        {/* ================= CHAT ================= */}

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} />
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 20,
          }}
          ListFooterComponent={
            sending ? (
              <View className="mb-3 self-start rounded-2xl border border-[#E8E6DF] bg-white px-3.5 py-2.5">
                <ActivityIndicator
                  size="small"
                  color="#4A9EFF"
                />
              </View>
            ) : null
          }
        />

        {/* ================= SUGGESTIONS ================= */}

        {messages.length <= 1 && (
          <View className="gap-2 px-5 pb-3">
            {SUGGESTED_PROMPTS.map(
              (prompt) => (
                <TouchableOpacity
                  key={prompt}
                  activeOpacity={0.7}
                  onPress={() =>
                    sendMessage(prompt)
                  }
                  className="self-start rounded-xl border border-[#E8E6DF] bg-white px-4 py-3"
                >
                  <Text className="text-xs text-brand-text-secondary">
                    {prompt}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}

        {/* ================= INPUT BAR ================= */}

        <Animated.View
          style={{
            transform: [
              {
                translateY:
                  inputTranslateY,
              },
            ],
          }}
          className="flex-row items-center gap-2 border-t border-[#E8E6DF] bg-brand-body px-5 py-3"
        >
          {/* TEXT INPUT */}

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your money..."
            placeholderTextColor="#8A8D96"
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={() =>
              sendMessage(input)
            }
            className="h-14 flex-1 rounded-full border border-[#E8E6DF] bg-white px-5 text-sm text-brand-bg"
          />

          {/* SEND BUTTON */}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              sendMessage(input)
            }
            disabled={sending}
            className="h-14 w-14 items-center justify-center rounded-full bg-brand-bg"
            style={{
              opacity: sending ? 0.5 : 1,
            }}
          >
            <Feather
              name="arrow-up"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}